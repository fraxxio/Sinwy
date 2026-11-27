import { describe, expect, it } from "bun:test";
import {
	BLOCKS,
	type BlockNode,
	type BlockType,
	bookingLink,
	pageDocumentSchema,
	pageLink,
} from "@sinwy/shared";
import {
	type LinkDestinations,
	publishIssues,
} from "../components/page-editor/publish-checks";

const nowhere: LinkDestinations = { services: [], pages: [] };

/** A block as the drawer adds it: every default filled in, slot defaults given ids. */
const added = (
	type: BlockType,
	id: string,
	props: Record<string, unknown> = {},
): BlockNode => {
	const definition = BLOCKS[type];
	const filled: Record<string, unknown> = { ...definition.defaults };
	for (const slot of definition.slots)
		filled[slot] = (definition.defaults[slot] as BlockNode[]).map(
			(child, index) =>
				added(child.type as BlockType, `${id}-${index}`, child.props),
		);
	return { type, props: { ...filled, ...props, id } };
};

describe("publishIssues", () => {
	it("finds unfilled blocks through nested slots, skipping columns the count hides", () => {
		const content = [
			added("Section", "section", {
				items: [
					added("Heading", "heading"),
					added("Columns", "columns", {
						count: "3",
						column1: [added("Button", "button", { label: " " })],
						column3: [added("Image", "image-shown")],
						column4: [added("Image", "image-hidden")],
					}),
					added("Photos", "photos"),
				],
			}),
		];
		expect(publishIssues(content, nowhere)).toEqual([
			{
				id: "heading",
				block: "Heading in Section",
				problem: "Still has its sample text",
			},
			{ id: "button", block: "Button in Columns", problem: "Has no label" },
			{ id: "image-shown", block: "Image in Columns", problem: "Has no photo" },
			{ id: "photos-0", block: "Image 1 in Photos", problem: "Has no photo" },
			{ id: "photos-1", block: "Image 2 in Photos", problem: "Has no photo" },
		]);
	});

	it("names a block after the block around it, and its place among blocks of its type", () => {
		const content = [
			added("Section", "section", {
				items: [
					added("Heading", "heading", { text: "Find us" }),
					added("Image", "image", { alt: "The salon" }),
				],
			}),
		];
		expect(publishIssues(content, nowhere)).toEqual([
			{ id: "image", block: "Image in Find us", problem: "Has no photo" },
		]);
	});

	it("flags nothing on a filled page, a Hero without a background included", () => {
		const content = [
			added("Hero", "hero"),
			added("Services", "services"),
			added("Section", "section", {
				items: [
					added("Heading", "heading", { text: "Our story" }),
					added("RichText", "text", { content: "<p>Since 2012.</p>" }),
					added("Image", "image", { src: "https://example.com/a.jpg" }),
					added("Button", "button", { label: "Call us", href: "tel:+123" }),
				],
			}),
			added("Photos", "photos", {
				items: [
					added("Image", "a", { src: "/a.jpg" }),
					added("Image", "b", { src: "/b.jpg" }),
				],
			}),
		];
		expect(publishIssues(content, nowhere)).toEqual([]);
	});

	it("still counts sample rich text as unfilled after the server normalises it", () => {
		const sample = BLOCKS.RichText.defaults["content"] as string;
		const saved = pageDocumentSchema.parse({
			schemaVersion: 2,
			data: {
				root: { props: {} },
				content: [
					added("Section", "section", {
						items: [
							added("RichText", "text", {
								content: `  ${sample.replace("<p>", '<p class="x">')}\n`,
							}),
						],
					}),
				],
			},
		});
		expect(publishIssues(saved.data.content as BlockNode[], nowhere)).toEqual([
			{
				id: "text",
				block: "Text in Section",
				problem: "Still has its sample text",
			},
		]);
	});

	it("treats a missing prop as its default", () => {
		const content = [
			{
				type: "Section",
				props: {
					id: "section",
					items: [
						{ type: "Image", props: { id: "image" } },
						{ type: "Button", props: { id: "button" } },
					],
				},
			},
		];
		expect(publishIssues(content, nowhere)).toEqual([
			{ id: "image", block: "Image in Section", problem: "Has no photo" },
		]);
	});

	describe("links that go nowhere", () => {
		const destinations: LinkDestinations = {
			services: [{ id: "haircut" }],
			pages: [{ id: "about-id", title: "About us", slug: "about-us" }],
		};
		const button = (id: string, href: string) =>
			added("Button", id, { label: "Go", href });

		it("lists each Button to a service no longer offered or a page that isn't live, in reading order", () => {
			const content = [
				added("Section", "section", {
					items: [
						button("gone-page", pageLink("deleted-id")),
						added("Columns", "columns", {
							count: "2",
							column1: [button("gone-service", bookingLink("colouring"))],
							column3: [button("hidden", pageLink("deleted-id"))],
						}),
					],
				}),
			];
			expect(publishIssues(content, destinations)).toEqual([
				{
					id: "gone-page",
					block: "Button in Section",
					problem: "Opens a page that isn't live, so customers won't see it",
				},
				{
					id: "gone-service",
					block: "Button in Columns",
					problem: "Opens booking for a service you no longer offer",
				},
			]);
		});

		it("flags nothing for booking, an offered service, a live page or a web address", () => {
			const content = [
				added("Section", "section", {
					items: [
						button("booking", bookingLink()),
						button("service", bookingLink("haircut")),
						button("page", pageLink("about-id")),
						button("old-slug", "about-us"),
						button("web", "https://example.com"),
						button("phone", "tel:+123"),
					],
				}),
			];
			expect(publishIssues(content, destinations)).toEqual([]);
		});
	});
});
