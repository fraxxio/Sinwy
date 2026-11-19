import { describe, expect, test } from "bun:test";
import {
	isSafeHref,
	isSafeImageSrc,
	normalizeRichText,
	parseRichText,
} from "@sinwy/shared";

const ALLOWED_TAGS = new Set([
	"p",
	"br",
	"strong",
	"em",
	"u",
	"s",
	"a",
	"ul",
	"ol",
	"li",
	"h2",
	"h3",
	"blockquote",
]);

/** Fails unless the HTML holds only allowlisted tags, with no attribute but `href` and `target="_blank"` on links. */
const expectAllowlisted = (html: string) => {
	for (const [, name = "", attributes = ""] of html.matchAll(
		/<\/?([a-z0-9]+)([^>]*)>/gi,
	)) {
		expect(ALLOWED_TAGS.has(name)).toBe(true);
		const rest = attributes
			.replace(/^ href="[^"]*"/, "")
			.replace(/^ target="_blank"/, "");
		expect(rest).toBe("");
		if (attributes) expect(name).toBe("a");
	}
};

const XSS = {
	script: '<p>a<script>alert("x")</script>b</p>',
	scriptUppercase: "<SCRIPT>alert(1)</SCRIPT><p>ok</p>",
	scriptFakeClose: '<script>document.write("</p>")</script><p>ok</p>',
	unclosedScript: "<p>ok</p><script>alert(1)",
	splitScript: "<scr<script>ipt>alert(1)</script>",
	onerror: '<img src="x" onerror="alert(1)"><p onclick="alert(1)">ok</p>',
	style:
		'<p style="background:url(javascript:alert(1))">ok</p><style>p{}</style>',
	iframe: '<iframe src="https://evil.example"></iframe><p>ok</p>',
	svg: '<svg><script>alert(1)</script><a href="https://x.example">in svg</a></svg><p>ok</p>',
	math: "<math><mi>alert</mi></math><p>ok</p>",
	template: "<template><p>hidden</p></template><p>ok</p>",
	comment: "<!-- <script>alert(1)</script> --><p>ok</p>",
	javascript: '<a href="javascript:alert(1)">x</a>',
	mixedCase: '<a href="JaVaScRiPt:alert(1)">x</a>',
	decimalEntity: '<a href="&#106;avascript:alert(1)">x</a>',
	hexEntity: '<a href="&#x6A;&#x61;vascript:alert(1)">x</a>',
	tabInScheme: '<a href="java&#x09;script:alert(1)">x</a>',
	leadingSpace: '<a href=" javascript:alert(1)">x</a>',
	unquoted: "<a href=javascript:alert(1)>x</a>",
	singleQuoted: "<a href='javascript:alert(1)'>x</a>",
	hrefInTitle:
		'<a title=" href=https://ok.example" href="javascript:alert(1)">x</a>',
	data: '<a href="data:text/html,<script>alert(1)</script>">x</a>',
	vbscript: '<a href="vbscript:msgbox(1)">x</a>',
	encodedTag: "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
	quoteInAttribute: '<a href="https://ok.example" title="a>b"><b>x</b></a>',
};

const MALFORMED = {
	unclosed: "<p>a<strong>b<em>c",
	strayClose: "a</p>b</strong>",
	misnested: "<p><strong>a<em>b</strong>c</em></p>",
	implicitParagraph: "<p>one<p>two",
	implicitItem: "<ul><li>one<li>two</ul>",
	nestedList:
		"<ul><li>one<ul><li>one.one</li><li>one.two</li></ul></li><li>two</li></ul>",
	listInParagraph: "<p>intro<ul><li>a</li></ul>outro</p>",
	itemWithoutList: "<li>a</li><li>b</li>",
	textInList: "<ul> loose <li>a</li></ul>",
	strayText: "hello <b>world</b><p>x</p>tail",
	divs: "<div>a</div><div>b<div>c</div></div>",
	headings: "<h1>Big</h1><h2>Two</h2><h4>Four</h4>",
	entities:
		"<p>&amp; &lt;b&gt; &quot;q&quot; &#169; &#x1F600; a&nbsp;b &bogus; &amp &#0;</p>",
	doubleEncoded: "<p>&amp;lt;b&amp;gt;</p>",
	blockquote:
		"<blockquote>quoted <b>text</b><blockquote>deeper</blockquote></blockquote>",
	nestedLinks:
		'<a href="https://a.example">a<a href="https://b.example">b</a></a>',
	emptyInline: "<p><strong></strong>a<em> </em></p>",
	unknownInline: "<p><span class=x>a</span><font>b</font></p>",
	selfClosingSvg: "<p>a<svg/>b</p>",
	unterminatedTag: '<p>ok</p><a href="https://x.example',
	whitespace: "\n  <p>a</p>\n  <p>b</p>\n",
	empty: "",
	emptyParagraph: "<p></p>",
	deep: `${"<blockquote>".repeat(30)}deep`,
	deepList: `${"<ul><li>".repeat(20)}deep`,
};

const PUCK = [
	"<p>Hello <strong>world</strong> and <em>you</em></p>",
	"<ul><li><p>One</p></li><li><p>Two <strong>bold</strong></p></li></ul>",
	"<ol><li><p>First</p></li></ol>",
	'<p>Visit <a href="https://example.com" target="_blank">https://example.com</a></p>',
	"<h2>Title</h2><h3>Sub</h3><blockquote><p>Quote</p></blockquote>",
	"<p>Line<br>break <u>under</u> <s>strike</s></p>",
	'<p><a href="mailto:hi@example.com">Mail</a> <a href="tel:+37060000000">Call</a> <a href="/booking">Book</a> <a href="#top">Top</a></p>',
];

describe("rich text", () => {
	test.each(Object.entries(XSS))("%s is neutralised", (_, html) => {
		const normalized = normalizeRichText(html);
		expectAllowlisted(normalized);
		expect(normalized).not.toMatch(
			/javascript|vbscript|data:|onerror|onclick|style=|<script|<img|<iframe|<svg/i,
		);
	});

	test("unsafe links keep their text but lose the link", () => {
		expect(normalizeRichText(XSS.javascript)).toBe("<p>x</p>");
		expect(normalizeRichText(XSS.decimalEntity)).toBe("<p>x</p>");
		expect(normalizeRichText(XSS.hrefInTitle)).toBe("<p>x</p>");
	});

	test("dropped elements take their content with them", () => {
		expect(normalizeRichText(XSS.script)).toBe("<p>ab</p>");
		expect(normalizeRichText(XSS.scriptFakeClose)).toBe("<p>ok</p>");
		expect(normalizeRichText(XSS.svg)).toBe("<p>ok</p>");
		expect(normalizeRichText(XSS.template)).toBe("<p>ok</p>");
		expect(normalizeRichText(XSS.unclosedScript)).toBe("<p>ok</p>");
		expect(normalizeRichText(XSS.encodedTag)).toBe(
			"<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
		);
		expect(normalizeRichText(XSS.quoteInAttribute)).toBe(
			'<p><a href="https://ok.example"><strong>x</strong></a></p>',
		);
	});

	test.each(
		Object.entries(MALFORMED),
	)("%s normalises to allowlisted HTML", (_, html) => {
		expectAllowlisted(normalizeRichText(html));
	});

	test("malformed HTML is repaired the way HTML would read it", () => {
		const cases: [string, string][] = [
			[MALFORMED.unclosed, "<p>a<strong>b<em>c</em></strong></p>"],
			[MALFORMED.strayClose, "<p>ab</p>"],
			[MALFORMED.implicitParagraph, "<p>one</p><p>two</p>"],
			[MALFORMED.implicitItem, "<ul><li>one</li><li>two</li></ul>"],
			[
				MALFORMED.nestedList,
				"<ul><li><p>one</p><ul><li>one.one</li><li>one.two</li></ul></li><li>two</li></ul>",
			],
			[
				MALFORMED.listInParagraph,
				"<p>intro</p><ul><li>a</li></ul><p>outro</p>",
			],
			[MALFORMED.itemWithoutList, "<ul><li>a</li><li>b</li></ul>"],
			[MALFORMED.textInList, "<ul><li> loose </li><li>a</li></ul>"],
			[
				MALFORMED.strayText,
				"<p>hello <strong>world</strong></p><p>x</p><p>tail</p>",
			],
			[MALFORMED.divs, "<p>a</p><p>b</p><p>c</p>"],
			[MALFORMED.headings, "<p>Big</p><h2>Two</h2><p>Four</p>"],
			[
				MALFORMED.entities,
				'<p>&amp; &lt;b&gt; "q" © 😀 a b &amp;bogus; &amp;amp �</p>',
			],
			[MALFORMED.doubleEncoded, "<p>&amp;lt;b&amp;gt;</p>"],
			[
				MALFORMED.blockquote,
				"<blockquote><p>quoted <strong>text</strong></p><blockquote><p>deeper</p></blockquote></blockquote>",
			],
			[
				MALFORMED.nestedLinks,
				'<p><a href="https://a.example">a</a><a href="https://b.example">b</a></p>',
			],
			[MALFORMED.emptyInline, "<p>a<em> </em></p>"],
			[MALFORMED.unknownInline, "<p>ab</p>"],
			[MALFORMED.selfClosingSvg, "<p>ab</p>"],
			[MALFORMED.unterminatedTag, "<p>ok</p>"],
			[MALFORMED.whitespace, "<p>a</p><p>b</p>"],
			[MALFORMED.empty, ""],
			[MALFORMED.emptyParagraph, "<p></p>"],
		];
		for (const [html, expected] of cases)
			expect(normalizeRichText(html)).toBe(expected);
	});

	test("aliases map to their allowlisted tags", () => {
		expect(normalizeRichText("<p><b>a</b><i>b</i></p>")).toBe(
			"<p><strong>a</strong><em>b</em></p>",
		);
	});

	test("deep nesting is capped and keeps its text", () => {
		const normalized = normalizeRichText(`${"<b>".repeat(100_000)}deep`);
		expect(normalized).toContain("<strong>deep</strong>");
		expect(normalized.match(/<strong>/g)?.length).toBeLessThanOrEqual(16);
		expect(normalizeRichText(MALFORMED.deep)).toContain("deep");
		expect(normalizeRichText(MALFORMED.deepList)).toContain("deep");
	});

	test("unterminated markup is read in linear time", () => {
		const inputs = [
			`<p>x</p>${"<a ".repeat(100_000)}`,
			`<p>x</p>${'<a b="'.repeat(50_000)}`,
			"<script>".repeat(50_000),
			"<<".repeat(100_000),
		];
		const started = performance.now();
		for (const html of inputs) expectAllowlisted(normalizeRichText(html));
		expect(performance.now() - started).toBeLessThan(1000);
	});

	test.each(PUCK)("Puck's rich text output is kept: %s", (html) => {
		expect(normalizeRichText(html)).toBe(html);
	});

	test("Puck's auto-linked anchors keep href and target", () => {
		expect(
			normalizeRichText(
				'<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">https://example.com</a></p>',
			),
		).toBe(
			'<p><a href="https://example.com" target="_blank">https://example.com</a></p>',
		);
	});

	test.each([
		...Object.values(XSS),
		...Object.values(MALFORMED),
		...PUCK,
	])("normalising is idempotent: %s", (html) => {
		const once = normalizeRichText(html);
		expect(normalizeRichText(once)).toBe(once);
	});

	test("idempotence holds past the depth cap", () => {
		const html = `${"<li><blockquote>".repeat(12)}deep <b>bold</b>`;
		const once = normalizeRichText(html);
		expect(normalizeRichText(once)).toBe(once);
	});

	test("parse returns a typed tree", () => {
		expect(
			parseRichText('<p>a<a href="/x" target="_blank">b</a><br></p>'),
		).toEqual([
			{
				type: "p",
				children: [
					{ type: "text", text: "a" },
					{
						type: "a",
						href: "/x",
						blank: true,
						children: [{ type: "text", text: "b" }],
					},
					{ type: "br" },
				],
			},
		]);
	});
});

describe("page URLs", () => {
	test("links", () => {
		for (const href of [
			"https://a.example",
			"http://a",
			"mailto:a@b.c",
			"tel:+1",
			"/x",
			"#top",
		])
			expect(isSafeHref(href)).toBe(true);
		for (const href of [
			"",
			"javascript:alert(1)",
			"data:text/html,x",
			"book",
			" https://a.example",
		])
			expect(isSafeHref(href)).toBe(false);
	});

	test("images", () => {
		for (const src of ["https://a.example/x.png", "/media/x.png"])
			expect(isSafeImageSrc(src)).toBe(true);
		for (const src of [
			"",
			"data:image/png;base64,x",
			"javascript:x",
			"mailto:a@b.c",
			"x.png",
		])
			expect(isSafeImageSrc(src)).toBe(false);
	});
});
