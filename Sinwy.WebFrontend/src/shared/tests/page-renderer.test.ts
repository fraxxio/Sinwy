import { expect, it } from "bun:test";
import type { PageContent, PageWidget } from "@sinwy/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderRichText } from "../components/page-builder/rich-text";
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

it("renders a Puck document server-side, slots included", () => {
	const html = renderToStaticMarkup(
		createElement(PageRenderer, {
			content: {
				schemaVersion: 2,
				data: {
					root: { props: {} },
					content: [
						{
							type: "Section",
							props: {
								id: "Section-1",
								tone: "muted",
								items: [
									{
										type: "Heading",
										props: { id: "Heading-1", text: "Welcome in", level: "1" },
									},
								],
							},
						},
						{ type: "Unknown", props: { id: "Unknown-1" } },
					],
				},
			},
			organizationSlug: "acme",
		}),
	);
	expect(html).toContain("<section");
	expect(html).toMatch(/<h1[^>]*>Welcome in<\/h1>/);
});

it("renders a FreeGrid as CSS Grid cells keyed by child id", () => {
	const html = renderToStaticMarkup(
		createElement(PageRenderer, {
			content: {
				schemaVersion: 2,
				data: {
					root: { props: {} },
					content: [
						{
							type: "FreeGrid",
							props: {
								id: "FreeGrid-1",
								layout: {
									desktop: { "Heading-b": { x: 6, y: 0, w: 6, h: 2 } },
								},
								items: [
									{
										type: "Heading",
										props: { id: "Heading-a", text: "A", level: "2" },
									},
									{
										type: "Heading",
										props: { id: "Heading-b", text: "B", level: "2" },
									},
								],
							},
						},
					],
				},
			},
			organizationSlug: "acme",
		}),
	);
	expect(html).toContain("grid-template-columns:repeat(12, minmax(0, 1fr))");
	expect(html).toMatch(
		/grid-column:1 \/ span 6;grid-row:3 \/ span 2"><h2[^>]*>A</,
	);
	expect(html).toMatch(
		/grid-column:7 \/ span 6;grid-row:1 \/ span 2"><h2[^>]*>B</,
	);
});

const renderPuck = async (
	content: unknown[],
	rootProps: Record<string, unknown> = {},
) => {
	const { renderToReadableStream } = await import("react-dom/server");
	const stream = await renderToReadableStream(
		createElement(PageRenderer, {
			content: {
				schemaVersion: 2,
				data: { root: { props: rootProps }, content } as never,
			},
			organizationSlug: "acme",
			services: [
				{
					id: "svc-1",
					name: "Haircut",
					description: "Wash, cut and style",
					durationMinutes: 45,
					priceMinor: 3500,
					currency: "EUR",
					requiresApproval: false,
					cancellationWindowMinutes: 0,
				},
				{
					id: "svc-2",
					name: "Colour",
					description: null,
					durationMinutes: 90,
					priceMinor: 8000,
					currency: "EUR",
					requiresApproval: false,
					cancellationWindowMinutes: 0,
				},
			],
		}),
	);
	await stream.allReady;
	return new Response(stream).text();
};

it("renders rich text formatting and drops scripts and javascript: links", async () => {
	const html = await renderPuck([
		{
			type: "RichText",
			props: {
				id: "RichText-1",
				content:
					'<p>We are <strong>open</strong> <a href="javascript:alert(1)">Click</a> <a target="_blank" rel="opener" href="https://example.com">site</a></p><ul><li>Cuts</li></ul><script>alert(1)</script><img src=x onerror="alert(1)">',
			},
		},
	]);
	expect(html).toContain("<strong>open</strong>");
	expect(html).toMatch(/<ul><li>(<p>)?Cuts(<\/p>)?<\/li><\/ul>/);
	expect(html).toContain(
		'<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">site</a>',
	);
	expect(html).not.toContain("javascript:");
	expect(html).not.toContain("<script");
	expect(html).not.toContain("onerror");
	expect(html).not.toContain("alert(1)");
});

it("unwraps unknown tags, decodes entities and closes what was left open", () => {
	const html = renderToStaticMarkup(
		createElement(
			"div",
			null,
			renderRichText(
				'<p>Fish &amp; chips &lt;b&gt; <span style="color:red">red</span> <a href="  JaVaScRiPt:x">x</a> <a href="/acme/book">book</a><ul><li>one<li>two</ul><h2>Hi',
			),
		),
	);
	expect(html).toBe(
		'<div><p>Fish &amp; chips &lt;b&gt; red <a>x</a> <a href="/acme/book">book</a></p><ul><li>one</li><li>two</li></ul><h2>Hi</h2></div>',
	);
});

it("renders the booking widget from the services passed in, in the chosen order", async () => {
	const html = await renderPuck([
		{
			type: "BookingWidget",
			props: {
				id: "BookingWidget-1",
				title: "Book",
				serviceIds: ["svc-2", "svc-1", "gone"],
			},
		},
	]);
	expect(html.indexOf("Colour")).toBeLessThan(html.indexOf("Haircut"));
	expect(html).toContain('href="/acme/book?service=svc-1"');
});

it("writes root tokens as CSS variables and ignores unknown token values", async () => {
	const html = await renderPuck([], { radius: "large", spacing: "nope" });
	expect(html).toContain("--pb-radius:1.5rem");
	expect(html).toContain("--pb-space:1.5rem");
});
