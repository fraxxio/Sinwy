import { isSafeHref } from "./PageUrls";

type InlineTag = "strong" | "em" | "u" | "s";
type ContainerTag =
	| InlineTag
	| "p"
	| "h2"
	| "h3"
	| "ul"
	| "ol"
	| "li"
	| "blockquote";

export type RichTextNode =
	| { type: "text"; text: string }
	| { type: "br" }
	| { type: "a"; href: string; blank: boolean; children: RichTextNode[] }
	| { type: ContainerTag; children: RichTextNode[] };

/** Deepest element nesting kept; deeper content is flattened to its text. */
const MAX_DEPTH = 16;

const TAGS: Record<string, ContainerTag | "a" | "br"> = {
	p: "p",
	h2: "h2",
	h3: "h3",
	ul: "ul",
	ol: "ol",
	li: "li",
	blockquote: "blockquote",
	strong: "strong",
	b: "strong",
	em: "em",
	i: "em",
	u: "u",
	s: "s",
	a: "a",
	br: "br",
};
const INLINE = new Set<string>(["strong", "em", "u", "s", "a"]);
const TEXT_BLOCKS = new Set<string>(["p", "h2", "h3"]);
/** Elements whose content HTML reads as raw text up to the closing tag. */
const RAW_TEXT = new Set([
	"script",
	"style",
	"iframe",
	"noscript",
	"textarea",
	"title",
]);
const DROP_WITH_CONTENT = new Set(["svg", "math", "template"]);
/** Unknown tags that still separate paragraphs when unwrapped. */
const BOUNDARIES = new Set([
	"div",
	"section",
	"article",
	"aside",
	"header",
	"footer",
	"main",
	"nav",
	"h1",
	"h4",
	"h5",
	"h6",
	"pre",
	"hr",
	"figure",
	"figcaption",
	"address",
	"table",
	"caption",
	"tr",
	"td",
	"th",
	"dl",
	"dt",
	"dd",
]);
const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	shy: "­",
	ndash: "–",
	mdash: "—",
	hellip: "…",
	lsquo: "‘",
	rsquo: "’",
	ldquo: "“",
	rdquo: "”",
	laquo: "«",
	raquo: "»",
	bull: "•",
	middot: "·",
	copy: "©",
	reg: "®",
	trade: "™",
	euro: "€",
};

const decode = (text: string) =>
	text
		.replace(
			/&(?:#x([\da-f]+)|#(\d+)|([a-z][a-z\d]*));/gi,
			(match, hex?: string, decimal?: string, name?: string) => {
				if (name) return ENTITIES[name] ?? match;
				const code = hex ? Number.parseInt(hex, 16) : Number(decimal);
				const valid =
					code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
				return valid ? String.fromCodePoint(code) : "�";
			},
		)
		.replaceAll("\0", "�");

const isBlank = (text: string) => /^[ \t\n\f\r]*$/.test(text);

type Token =
	| { kind: "text"; text: string }
	| { kind: "open" | "close"; name: string; attributes: string };

/** Index of the `>` ending a tag, skipping quoted attribute values; -1 if the tag never ends. */
const tagEnd = (html: string, from: number) => {
	let quote: string | null = null;
	let afterEquals = false;
	for (let i = from; i < html.length; i++) {
		const char = html[i];
		if (quote) {
			if (char === quote) quote = null;
		} else if (char === ">") return i;
		else if (afterEquals && (char === '"' || char === "'")) quote = char;
		if (!quote && !/\s/.test(char ?? "")) afterEquals = char === "=";
	}
	return -1;
};

const TAG_NAME = /<(\/?)([a-z][^\s/>]*)/iy;

/** Splits HTML into text and tags in one pass. Unterminated markup ends the input, as in HTML. */
function* tokenize(html: string): Generator<Token> {
	let at = 0;
	while (at < html.length) {
		const lt = html.indexOf("<", at);
		if (lt === -1) {
			yield { kind: "text", text: html.slice(at) };
			return;
		}
		if (lt > at) yield { kind: "text", text: html.slice(at, lt) };
		if (html.startsWith("<!--", lt)) {
			const end = html.indexOf("-->", lt + 4);
			if (end === -1) return;
			at = end + 3;
			continue;
		}
		if (html[lt + 1] === "!" || html[lt + 1] === "?") {
			const end = html.indexOf(">", lt + 2);
			if (end === -1) return;
			at = end + 1;
			continue;
		}
		TAG_NAME.lastIndex = lt;
		const match = TAG_NAME.exec(html);
		if (!match) {
			yield { kind: "text", text: "<" };
			at = lt + 1;
			continue;
		}
		const end = tagEnd(html, TAG_NAME.lastIndex);
		if (end === -1) return;
		const name = (match[2] ?? "").toLowerCase();
		const kind = match[1] ? "close" : "open";
		yield {
			kind,
			name,
			attributes: html.slice(TAG_NAME.lastIndex, end),
		};
		at = end + 1;
		if (kind === "open" && RAW_TEXT.has(name)) {
			const closing = new RegExp(`</${name}[\\s/>]`, "gi");
			closing.lastIndex = at;
			const found = closing.exec(html);
			const closeEnd = found ? tagEnd(html, found.index + 2 + name.length) : -1;
			if (closeEnd === -1) return;
			at = closeEnd + 1;
		}
	}
}

const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

const attribute = (attributes: string, name: string) => {
	for (const match of attributes.matchAll(ATTRIBUTE)) {
		if (match[1]?.toLowerCase() === name)
			return decode(match[2] ?? match[3] ?? match[4] ?? "").trim();
	}
	return "";
};

type Element = {
	type: ContainerTag | "a" | "root";
	href?: string;
	blank?: boolean;
	children: Draft[];
};
/** `break` marks where an unwrapped block tag stood, so its text stays a separate paragraph. */
type Draft =
	| { type: "text"; text: string }
	| { type: "br" }
	| { type: "break" }
	| Element;

const isInline = (node: Draft) =>
	node.type === "text" || node.type === "br" || INLINE.has(node.type);

/** Builds the tag tree the way HTML would: opening a block closes an open `p` or inline element, and a new `li` closes the open one. */
function build(html: string): Element {
	const root: Element = { type: "root", children: [] };
	const stack: Element[] = [root];
	const top = () => stack[stack.length - 1] as Element;
	const closeInline = () => {
		while (INLINE.has(top().type) || TEXT_BLOCKS.has(top().type)) stack.pop();
	};
	let dropping: { name: string; depth: number } | null = null;

	for (const token of tokenize(html)) {
		if (token.kind === "text") {
			if (!dropping)
				top().children.push({ type: "text", text: decode(token.text) });
			continue;
		}
		const { kind, name, attributes } = token;
		const selfClosing = attributes.trimEnd().endsWith("/");
		if (dropping) {
			if (name === dropping.name && !(kind === "open" && selfClosing))
				dropping.depth += kind === "open" ? 1 : -1;
			if (dropping.depth === 0) dropping = null;
			continue;
		}
		if (DROP_WITH_CONTENT.has(name)) {
			if (kind === "open" && !selfClosing) dropping = { name, depth: 1 };
			continue;
		}
		if (BOUNDARIES.has(name)) {
			closeInline();
			top().children.push({ type: "break" });
			continue;
		}
		const tag = TAGS[name];
		if (!tag) continue;
		if (kind === "close") {
			const index = stack.findLastIndex((node) => node.type === tag);
			if (index > 0) stack.length = index;
			continue;
		}
		if (tag === "br") {
			top().children.push({ type: "br" });
			continue;
		}
		if (!INLINE.has(tag)) closeInline();
		if (tag === "li" && top().type === "li") stack.pop();
		let node: Element = { type: tag, children: [] };
		if (tag === "a") {
			const open = stack.findLastIndex((item) => item.type === "a");
			if (open > 0) stack.length = open;
			const href = attribute(attributes, "href");
			if (!isSafeHref(href)) continue;
			const blank = attribute(attributes, "target").toLowerCase() === "_blank";
			node = { type: "a", href, blank, children: [] };
		}
		if (stack.length > MAX_DEPTH) continue;
		top().children.push(node);
		stack.push(node);
	}
	return root;
}

const appendText = (out: RichTextNode[], text: string) => {
	if (!text) return;
	const last = out[out.length - 1];
	if (last?.type === "text") last.text += text;
	else out.push({ type: "text", text });
};

/** Inline content: text merged, empty inline elements dropped, anything block-level unwrapped. */
function inline(children: Draft[], out: RichTextNode[] = []) {
	for (const child of children) {
		if (child.type === "text") appendText(out, child.text);
		else if (child.type === "br") out.push({ type: "br" });
		else if (child.type === "break") continue;
		else if (INLINE.has(child.type)) {
			const kids = inline(child.children);
			if (!kids.length) continue;
			out.push(
				child.type === "a"
					? {
							type: "a",
							href: child.href ?? "",
							blank: child.blank ?? false,
							children: kids,
						}
					: { type: child.type as InlineTag, children: kids },
			);
		} else inline(child.children, out);
	}
	return out;
}

const trimEdges = (nodes: RichTextNode[]) => {
	const first = nodes[0];
	if (first?.type === "text")
		first.text = first.text.replace(/^[ \t\n\f\r]+/, "");
	const last = nodes[nodes.length - 1];
	if (last?.type === "text") last.text = last.text.replace(/[ \t\n\f\r]+$/, "");
	return nodes.filter((node) => node.type !== "text" || node.text);
};

/** Flow content (the root, a quote, a list item holding blocks): stray inline content goes into a `p` and stray `li`s into a `ul`. */
function flow(children: Draft[]): RichTextNode[] {
	const out: RichTextNode[] = [];
	let run: Draft[] = [];
	let items: Draft[] = [];
	const endRun = () => {
		const kids = trimEdges(inline(run));
		if (kids.length) out.push({ type: "p", children: kids });
		run = [];
	};
	const endItems = () => {
		if (items.length) out.push({ type: "ul", children: list(items) });
		items = [];
	};
	for (const child of children) {
		if (child.type === "li") {
			endRun();
			items.push(child);
		} else if (isInline(child)) {
			if (child.type === "text" && isBlank(child.text) && !run.length) continue;
			endItems();
			run.push(child);
		} else {
			endRun();
			endItems();
			if (child.type !== "break") out.push(...block(child as Element));
		}
	}
	endRun();
	endItems();
	return out;
}

function block(node: Element): RichTextNode[] {
	switch (node.type) {
		case "ul":
		case "ol": {
			const items = list(node.children);
			return items.length ? [{ type: node.type, children: items }] : [];
		}
		case "blockquote":
			return [{ type: "blockquote", children: flow(node.children) }];
		case "p":
		case "h2":
		case "h3":
			return [{ type: node.type, children: inline(node.children) }];
		default:
			return flow(node.children);
	}
}

/** List content: every child is an `li`, stray content goes into one. */
function list(children: Draft[]): RichTextNode[] {
	const out: RichTextNode[] = [];
	let run: Draft[] = [];
	const endRun = () => {
		const hasContent = run.some(
			(node) =>
				node.type !== "break" && !(node.type === "text" && isBlank(node.text)),
		);
		if (hasContent) out.push(listItem(run));
		run = [];
	};
	for (const child of children) {
		if (child.type === "li") {
			endRun();
			out.push(listItem(child.children));
		} else run.push(child);
	}
	endRun();
	return out;
}

const listItem = (children: Draft[]): RichTextNode => ({
	type: "li",
	children: children.every(isInline) ? inline(children) : flow(children),
});

const flatten = (node: RichTextNode, out: RichTextNode[] = []) => {
	if (node.type === "text") appendText(out, node.text);
	else if (node.type === "br") out.push(node);
	else for (const child of node.children) flatten(child, out);
	return out;
};

/** Elements at `MAX_DEPTH` keep only their text; a list or quote there becomes a paragraph. */
const limitDepth = (nodes: RichTextNode[], depth = 1): RichTextNode[] =>
	nodes.map((node) => {
		if (node.type === "text" || node.type === "br") return node;
		if (depth < MAX_DEPTH)
			return { ...node, children: limitDepth(node.children, depth + 1) };
		const children = flatten(node).filter(
			(child) => child.type !== "text" || child.text,
		);
		if (node.type === "ul" || node.type === "ol" || node.type === "blockquote")
			return { type: "p", children };
		return { ...node, children };
	});

/** Parses any HTML into allowlisted rich text nodes. No DOM, so it runs the same in Bun and the browser. */
export const parseRichText = (html: string): RichTextNode[] =>
	limitDepth(flow(build(html).children));

const escapeText = (text: string) =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeAttribute = (value: string) =>
	value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

export const serializeRichText = (nodes: RichTextNode[]): string =>
	nodes
		.map((node) => {
			switch (node.type) {
				case "text":
					return escapeText(node.text);
				case "br":
					return "<br>";
				case "a": {
					const children = serializeRichText(node.children);
					if (!isSafeHref(node.href)) return children;
					const target = node.blank ? ' target="_blank"' : "";
					return `<a href="${escapeAttribute(node.href)}"${target}>${children}</a>`;
				}
				default:
					return `<${node.type}>${serializeRichText(node.children)}</${node.type}>`;
			}
		})
		.join("");

/** Canonical allowlisted HTML; normalising twice gives the same result as once. */
export const normalizeRichText = (html: string) =>
	serializeRichText(parseRichText(html));
