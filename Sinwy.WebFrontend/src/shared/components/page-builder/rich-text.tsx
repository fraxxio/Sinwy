import { createElement, type ReactNode } from "react";

/** Tags the rich text field can produce; anything else is unwrapped to its text. */
const ALLOWED: Record<string, string> = {
	p: "p",
	strong: "strong",
	b: "strong",
	em: "em",
	i: "em",
	u: "u",
	s: "s",
	a: "a",
	ul: "ul",
	ol: "ol",
	li: "li",
	h2: "h2",
	h3: "h3",
	blockquote: "blockquote",
	br: "br",
	hr: "hr",
};
const VOID = new Set(["br", "hr"]);
const BLOCKS = new Set(["p", "ul", "ol", "h2", "h3", "blockquote", "hr"]);
const DROP_WITH_CONTENT = new Set([
	"script",
	"style",
	"iframe",
	"noscript",
	"template",
	"textarea",
	"title",
	"svg",
	"math",
]);
const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i;
const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

const decode = (text: string) =>
	text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
		if (entity[0] !== "#") return ENTITIES[entity.toLowerCase()] ?? match;
		const code =
			entity[1] === "x" || entity[1] === "X"
				? Number.parseInt(entity.slice(2), 16)
				: Number(entity.slice(1));
		return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
	});

const attribute = (attributes: string, name: string) => {
	const match = new RegExp(
		`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
		"i",
	).exec(attributes);
	return decode(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
};

type Node = {
	tag: string;
	props: { href?: string; rel?: string; target?: string };
	children: ReactNode[];
};

/** Turns stored rich text HTML into React elements: allowlisted tags only, no attributes but a safe `href`, text escaped by React. */
export function renderRichText(html: unknown): ReactNode {
	if (typeof html !== "string") return null;
	const root: Node = { tag: "", props: {}, children: [] };
	const stack: Node[] = [root];
	const top = () => stack[stack.length - 1] as Node;
	let dropping: string | null = null;
	let last = 0;
	const tags = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>|<!--[\s\S]*?-->/gi;

	const close = (node: Node) => {
		const parent = stack[stack.length - 1] as Node;
		parent.children.push(
			createElement(
				node.tag,
				{ key: parent.children.length, ...node.props },
				...node.children,
			),
		);
	};

	for (const match of html.matchAll(tags)) {
		const text = html.slice(last, match.index);
		last = match.index + match[0].length;
		if (!dropping && text) top().children.push(decode(text));
		const [, slash, rawName, attributes = ""] = match;
		if (!rawName) continue;
		const name = rawName.toLowerCase();
		if (dropping) {
			if (slash && name === dropping) dropping = null;
			continue;
		}
		if (DROP_WITH_CONTENT.has(name)) {
			if (!slash) dropping = name;
			continue;
		}
		const tag = ALLOWED[name];
		if (!tag) continue;
		if (slash) {
			const index = stack.findLastIndex((node) => node.tag === tag);
			if (index < 1) continue;
			while (stack.length > index) close(stack.pop() as Node);
			continue;
		}
		const closesOpen =
			(BLOCKS.has(tag) && top().tag === "p") ||
			(tag === "li" && top().tag === "li");
		if (closesOpen) close(stack.pop() as Node);
		const props: Node["props"] = {};
		if (tag === "a") {
			const href = attribute(attributes, "href");
			if (SAFE_HREF.test(href)) props.href = href;
			if (attribute(attributes, "target") === "_blank") props.target = "_blank";
			if (/^https?:/i.test(href)) props.rel = "noopener noreferrer nofollow";
		}
		const node = { tag, props, children: [] };
		if (VOID.has(tag)) {
			stack.push(node);
			close(stack.pop() as Node);
		} else stack.push(node);
	}
	if (!dropping) {
		const rest = html.slice(last);
		if (rest) top().children.push(decode(rest));
	}
	while (stack.length > 1) close(stack.pop() as Node);
	return root.children;
}
