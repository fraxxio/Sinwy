import { isSafeHref, parseRichText, type RichTextNode } from "@sinwy/shared";
import { createElement, type ReactNode } from "react";

const renderNodes = (nodes: RichTextNode[]): ReactNode[] =>
	nodes.map((node, index) => {
		switch (node.type) {
			case "text":
				return node.text;
			case "br":
				return createElement("br", { key: index });
			case "a":
				return isSafeHref(node.href)
					? createElement(
							"a",
							{
								key: index,
								href: node.href,
								rel: "noopener noreferrer",
								...(node.blank && { target: "_blank" }),
							},
							...renderNodes(node.children),
						)
					: renderNodes(node.children);
			default:
				return createElement(
					node.type,
					{ key: index },
					...renderNodes(node.children),
				);
		}
	});

/** Stored rich text as React elements, through the same allowlist the server normalises with. */
export function RichText({ html }: { html: unknown }) {
	return typeof html === "string" ? renderNodes(parseRichText(html)) : null;
}
