import { expect, it } from "bun:test";
import type { PageContent, PageWidget } from "@sinwy/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageRenderer } from "../components/page-content/PageRenderer";

const render = (widgets: PageWidget[]) =>
	renderToStaticMarkup(
		createElement(PageRenderer, {
			content: { schemaVersion: 1, widgets } satisfies PageContent,
			organizationSlug: "acme",
		}),
	);

it("renders every MVP widget type", () => {
	const html = render([
		{ id: "h", type: "heading", props: { text: "Welcome", level: 1 } },
		{ id: "t", type: "text", props: { text: "We cut hair." } },
		{ id: "i", type: "image", props: { src: "/salon.jpg", alt: "The salon" } },
		{ id: "b", type: "button", props: { label: "Book now", href: "book" } },
		{
			id: "g",
			type: "gallery",
			props: { images: [{ src: "https://cdn.test/a.jpg", alt: "Chair" }] },
		},
		{
			id: "q",
			type: "testimonials",
			props: { items: [{ quote: "Great cut", author: "Ana" }] },
		},
	]);

	expect(html).toContain("<h1");
	expect(html).toContain("Welcome");
	expect(html).toContain("We cut hair.");
	expect(html).toContain('src="/salon.jpg"');
	expect(html).toContain('alt="The salon"');
	expect(html).toContain('href="/acme/book"');
	expect(html).toContain("Book now");
	expect(html).toContain('src="https://cdn.test/a.jpg"');
	expect(html).toContain("Great cut");
	expect(html).toContain("Ana");
});

it("skips an unknown widget type and keeps the rest", () => {
	const html = render([
		{ id: "x", type: "carousel", props: { text: "Hidden" } } as never,
		{ id: "t", type: "text", props: { text: "Still here" } },
	]);

	expect(html).not.toContain("Hidden");
	expect(html).toContain("Still here");
});

it("renders nested children", () => {
	const html = render([
		{
			id: "h",
			type: "heading",
			props: { text: "Parent" },
			children: [{ id: "t", type: "text", props: { text: "Child" } }],
		},
	]);

	expect(html).toContain("Parent");
	expect(html).toContain("Child");
});

it("drops unsafe links and malformed props", () => {
	const html = render([
		{
			id: "b",
			type: "button",
			props: { label: "Click", href: "javascript:alert(1)" },
		},
		{ id: "i", type: "image", props: { src: "javascript:alert(1)" } },
		{ id: "g", type: "gallery", props: { images: "nope" } },
		{ id: "h", type: "heading", props: { text: 42 } },
	]);

	expect(html).not.toContain("javascript:");
	expect(html).not.toContain("Click");
	expect(html).not.toContain("<img");
	expect(html).not.toContain("<h");
});
