import { describe, expect, test } from "bun:test";
import {
	BLOCKS,
	type PublicServiceDto,
	pageDocumentSchema,
	resolvePageLinks,
} from "@sinwy/shared";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { PageMetadata } from "../components/page-builder/blocks";
import {
	PageDocumentView,
	readPageContent,
} from "../components/page-builder/PageDocumentView";

let nextId = 0;

const block = (type: string, props: Record<string, unknown> = {}) => ({
	type,
	props: { id: `${type}-${++nextId}`, ...props },
});

const doc = (content: unknown[]) => ({
	schemaVersion: 2,
	data: { root: { props: {} }, content },
});

const service = (id: string, name: string): PublicServiceDto => ({
	id,
	name,
	description: null,
	durationMinutes: 45,
	priceMinor: 2500,
	currency: "EUR",
	requiresApproval: false,
	cancellationWindowMinutes: 0,
});

const METADATA: PageMetadata = {
	organizationSlug: "acme",
	services: [
		service("svc-1", "Haircut"),
		service("svc-2", "Colouring"),
		service("svc-3", "Shave"),
	],
	branding: { color: "#336699", font: null },
};

const render = (document: unknown, metadata: PageMetadata = METADATA) =>
	renderToString(createElement(PageDocumentView, { document, metadata }));

const MESSY_TEXT =
	'<div><b>Walk-ins</b> welcome<br>Mon–Sat <a href="https://maps.example/salon" target="_blank" rel="x">Find us</a></div>';

const salonDocument = () =>
	doc([
		block("Hero", {
			image: "https://cdn.example/hero.jpg",
			align: "center",
			items: [
				block("Heading", { text: "Studio Lumi", size: "1", align: "center" }),
				block("RichText", { content: MESSY_TEXT }),
				block("Button", { label: "Book now", href: "book" }),
			],
		}),
		block("Section", {
			tone: "muted",
			padding: "large",
			items: [
				block("Heading", { text: "About us", size: "2" }),
				block("RichText", {
					content: "<ul><li>Cuts</li><li><strong>Colour</strong></li></ul>",
				}),
				block("Image", {
					src: "/uploads/team.jpg",
					alt: "Our team",
					aspect: "square",
				}),
				block("Button", {
					label: "Call",
					href: "tel:+3701234567",
					variant: "outline",
					align: "center",
				}),
				block("Columns", {
					count: "2",
					column1: [
						block("Image", { src: "https://cdn.example/a.jpg", alt: "" }),
						block("RichText", { content: "<p>Left</p>" }),
					],
					column2: [
						block("Heading", { text: "Right", size: "3" }),
						block("Button", { label: "Prices", href: "#prices" }),
					],
					column3: [block("Heading", { text: "Hidden until count is 3" })],
					column4: [],
				}),
			],
		}),
		block("Services", {
			title: "Our services",
			intro: "<p>Pick one</p>",
			serviceIds: ["svc-2", "svc-1"],
		}),
	]);

describe("PageDocumentView", () => {
	test("renders every block of a full document on the server", () => {
		const html = render(salonDocument());

		for (const text of [
			"Studio Lumi",
			"<strong>Walk-ins</strong>",
			"About us",
			"<li>Cuts</li>",
			"<strong>Colour</strong>",
			"Left",
			"Right",
			"Our services",
			"Pick one",
		])
			expect(html).toContain(text);
		expect(html).toContain("<h1");
		expect(html).toContain('src="https://cdn.example/hero.jpg"');
		expect(html).toContain('src="/uploads/team.jpg"');
		expect(html).toContain('alt="Our team"');
		expect(html).toContain('href="/acme/book"');
		expect(html).toContain('href="tel:+3701234567"');
		expect(html).toContain('href="#prices"');
		expect(html).toContain("data-brand-color");
		expect(html).not.toContain("Hidden until count is 3");
	});

	test("links a Button that opens one service's booking under the organization", () => {
		const html = render(
			doc([
				block("Section", {
					items: [
						block("Button", { label: "Haircut", href: "book?service=svc-1" }),
					],
				}),
			]),
		);

		expect(html).toContain('href="/acme/book?service=svc-1"');
	});

	test("links a Button to another page as the server serves it, under the organization", () => {
		const stored = pageDocumentSchema.parse(
			doc([
				block("Section", {
					items: [
						block("Button", { label: "About", href: "page:pg-about" }),
						block("Button", { label: "Gone", href: "page:pg-gone" }),
					],
				}),
			]),
		);

		const html = render(
			resolvePageLinks(stored, new Map([["pg-about", "about-us"]])),
		);

		expect(html).toContain('href="/acme/about-us"');
		expect(html).toContain("About");
		expect(html).not.toContain("Gone");
		expect(html).not.toContain("page:");
	});

	test("lists the chosen services in their order with Book links", () => {
		const html = render(salonDocument());

		expect(html.indexOf("Colouring")).toBeLessThan(html.indexOf("Haircut"));
		expect(html).not.toContain("Shave");
		expect(html).toContain('href="/acme/book?service=svc-2"');
		expect(html).toContain('href="/acme/book?service=svc-1"');
	});

	test("lists every service when none are chosen", () => {
		const html = render(doc([block("Services")]));

		for (const name of ["Haircut", "Colouring", "Shave"])
			expect(html).toContain(name);
	});

	test("Photos renders its images side by side, stacked on a phone unless set otherwise", () => {
		const photos = (props: Record<string, unknown>) =>
			block("Photos", {
				...props,
				items: [
					block("Image", { src: "https://cdn.example/1.jpg" }),
					block("Image", { src: "https://cdn.example/2.jpg" }),
					block("Image"),
				],
			});
		const stacked = render(doc([photos({})]));
		const row = render(doc([photos({ phoneLayout: "row", gap: "none" })]));

		expect(stacked).toContain('src="https://cdn.example/1.jpg"');
		expect(stacked).toContain('src="https://cdn.example/2.jpg"');
		expect(stacked.match(/<img/g)).toHaveLength(2);
		expect(stacked).toContain("max-sm:grid-cols-1");
		expect(stacked).toContain("[--gap:--spacing(4)]");
		expect(row).not.toContain("max-sm:grid-cols-1");
		expect(row).toContain("[--gap:0px]");
	});

	test("Booking lists the chosen services into booking, with a main Book now button", () => {
		const html = render(
			doc([
				block("Booking", {
					title: "Book with us",
					intro: "<p>Any time</p>",
					serviceIds: ["svc-3"],
				}),
			]),
		);

		for (const text of ["Book with us", "Any time", "Shave", "Book now"])
			expect(html).toContain(text);
		expect(html).not.toContain("Haircut");
		expect(html).toContain('href="/acme/book?service=svc-3"');
		expect(html).toContain('href="/acme/book"');
	});

	test("Booking lists every service when none are chosen", () => {
		const html = render(doc([block("Booking")]));

		for (const name of ["Haircut", "Colouring", "Shave"])
			expect(html).toContain(name);
	});

	test("renders rich text safely", () => {
		const html = render(
			doc([
				block("Section", {
					items: [
						block("RichText", {
							content:
								'<p><strong>Bold</strong> <script>alert(1)</script><a href="javascript:alert(2)">bad</a> <a href="https://good.example" target="_blank">good</a></p><ol><li>One</li></ol><img src=x onerror="alert(3)">',
						}),
					],
				}),
			]),
		);

		expect(html).toContain("<strong>Bold</strong>");
		expect(html).toContain("<ol><li>One</li></ol>");
		expect(html).toContain(
			'<a href="https://good.example" rel="noopener noreferrer" target="_blank">good</a>',
		);
		expect(html).not.toContain("script");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("onerror");
		expect(html).not.toContain("<img");
	});

	test("skips unknown and malformed blocks and keeps the rest", () => {
		const html = render(
			doc([
				block("Carousel", { text: "Unknown at the top" }),
				block("constructor", { text: "Inherited key" }),
				block("__proto__", { text: "Prototype key" }),
				"not a block",
				{ type: "Section" },
				block("Section", {
					items: [
						block("Carousel", { text: "Unknown in a slot" }),
						{ type: "Heading", props: { text: "No id" } },
						block("Heading", { text: "Still here" }),
					],
				}),
				block("Section", { items: "not a list" }),
			]),
		);

		expect(html).toContain("Still here");
		for (const text of [
			"Unknown at the top",
			"Inherited key",
			"Prototype key",
			"Unknown in a slot",
			"No id",
		])
			expect(html).not.toContain(text);
	});

	test("renders a stored child its slot no longer allows", () => {
		const html = render(
			doc([
				block("Section", {
					items: [
						block("Hero", {
							items: [block("Heading", { text: "Nested hero" })],
						}),
					],
				}),
			]),
		);

		expect(html).toContain("Nested hero");
	});

	test("falls back to defaults for missing and invalid props", () => {
		const [heading, button, image] = readPageContent(
			doc([
				block("Heading", { size: "9", text: 42 }),
				block("Button", { href: "javascript:alert(1)" }),
				block("Image", { src: "javascript:alert(1)" }),
			]),
		);

		expect(heading?.props).toMatchObject(BLOCKS.Heading.defaults);
		expect(button?.props).toMatchObject(BLOCKS.Button.defaults);
		expect(image?.props["src"]).toBe("");
	});

	test("renders nothing for a document that isn't one", () => {
		for (const document of [
			null,
			"x",
			{ data: null },
			{ data: { content: {} } },
		])
			expect(() => render(document)).not.toThrow();
	});

	test("a block migration renders an old shape like the current one", () => {
		const migrations = {
			Heading: [
				({ title, ...props }: Record<string, unknown>) =>
					title === undefined ? props : { ...props, text: title },
			],
		};
		const old = doc([block("Heading", { title: "Welcome", size: "1" })]);
		const current = doc([
			{
				type: "Heading",
				props: { id: "Heading-x", text: "Welcome", size: "1" },
			},
		]);
		const migrated = readPageContent(old, { migrations });

		expect(migrated[0]?.props["text"]).toBe("Welcome");
		expect(render(doc(migrated)).replace(/Heading-\d+/g, "Heading-x")).toBe(
			render(current),
		);
	});
});
