import { describe, expect, test } from "bun:test";
import {
	BLOCKS,
	type BlockMigration,
	type BlockNode,
	type BlockProps,
	type BlockTemplate,
	blocksIn,
	createPageDocumentSchema,
	defineBlock,
	field,
	migrateDocument,
	normalizeRichText,
	pageDocumentSchema,
	ROOT_ALLOW,
} from "@sinwy/shared";

let nextId = 0;

const block = (
	type: string,
	props: Record<string, unknown> = {},
	id = `${type}-${++nextId}`,
): BlockNode => ({ type, props: { id, ...props } });

/** Gives slot default content ids, the way the editor does when a block is added. */
const withIds = (templates: readonly BlockTemplate[]) =>
	templates.map(({ type, props }) => block(type, props));

const doc = (content: unknown[]) => ({
	schemaVersion: 2,
	data: { root: { props: {} }, content },
});

const section = (...items: unknown[]) => block("Section", { items });

const errorsOf = (value: unknown, schema = pageDocumentSchema) => {
	const result = schema.safeParse(value);
	expect(result.success).toBe(false);
	return result.error?.issues.map((issue) => issue.message) ?? [];
};

const expectRefused = (value: unknown, message: string) =>
	expect(errorsOf(value)).toContainEqual(expect.stringContaining(message));

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
				block("Button", {
					label: "Book now",
					href: "book",
					variant: "primary",
				}),
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

describe("block manifest", () => {
	test("every block's defaults validate", () => {
		for (const [type, definition] of Object.entries(BLOCKS)) {
			const props = Object.fromEntries(
				Object.entries(definition.defaults).map(([name, value]) => [
					name,
					definition.slots.includes(name)
						? withIds(value as BlockTemplate[])
						: value,
				]),
			);
			const node = block(type, props);
			const content = ROOT_ALLOW.includes(type as never)
				? [node]
				: [section(node)];
			expect(pageDocumentSchema.safeParse(doc(content)).error).toBeUndefined();
		}
	});

	test("prop types follow the fields", () => {
		const heading: BlockProps<"Heading"> = { text: "Hi", size: "1" };
		const columns: BlockProps<"Columns"> = {
			column1: [],
			column2: [],
			column3: [],
			column4: [],
		};
		// @ts-expect-error size is one of the select's values
		const bad: BlockProps<"Heading"> = { size: "9" };
		expect([heading, columns, bad]).toHaveLength(3);
	});
});

describe("pageDocumentSchema", () => {
	test("a full salon document round-trips, with only rich text normalised", () => {
		const input = salonDocument();
		const parsed = pageDocumentSchema.parse(input);

		const expected = structuredClone(input) as ReturnType<typeof salonDocument>;
		const [hero] = expected.data.content as BlockNode[];
		const heroItems = hero?.props["items"] as BlockNode[];
		const messy = heroItems[1];
		if (!messy) throw new Error("fixture changed");
		messy.props["content"] = normalizeRichText(MESSY_TEXT);

		expect(normalizeRichText(MESSY_TEXT)).not.toBe(MESSY_TEXT);
		expect(parsed).toEqual(expected as never);
	});

	test("an empty page is valid", () => {
		expect(pageDocumentSchema.parse(doc([]))).toEqual(doc([]) as never);
	});

	test("Puck's empty zones are accepted and dropped; non-empty ones are refused", () => {
		const withZones = { ...doc([]), data: { ...doc([]).data, zones: {} } };
		expect(pageDocumentSchema.parse(withZones)).toEqual(doc([]) as never);
		expectRefused(
			{ ...doc([]), data: { ...doc([]).data, zones: { "a:b": [] } } },
			"Drop zones are not supported",
		);
	});

	test("unknown root props are refused", () => {
		expectRefused(
			{
				schemaVersion: 2,
				data: { root: { props: { radius: "large" } }, content: [] },
			},
			'Page settings have an unknown field "radius"',
		);
	});

	test("the envelope version must be 2", () => {
		expectRefused(
			{ schemaVersion: 1, widgets: [] },
			"Unsupported page document version",
		);
	});

	test("NUL characters are stripped from text", () => {
		const parsed = pageDocumentSchema.parse(
			doc([section(block("Heading", { text: "a\0b" }, "h"))]),
		);
		const heading = (parsed.data.content[0]?.props["items"] as BlockNode[])[0];
		expect(heading?.props["text"]).toBe("ab");
	});

	test("rich text with a javascript: link is accepted with the link removed", () => {
		const parsed = pageDocumentSchema.parse(
			doc([
				section(
					block(
						"RichText",
						{ content: '<p><a href="javascript:alert(1)">x</a></p>' },
						"t",
					),
				),
			]),
		);
		const text = (parsed.data.content[0]?.props["items"] as BlockNode[])[0];
		expect(text?.props["content"]).toBe("<p>x</p>");
	});

	test("Button links take safe hrefs and bare paths", () => {
		for (const href of [
			"book",
			"services/cuts",
			"/x",
			"#top",
			"mailto:a@b.c",
			"",
		])
			expect(
				pageDocumentSchema.safeParse(doc([section(block("Button", { href }))]))
					.success,
			).toBe(true);
	});

	describe("refuses, naming the block", () => {
		test("an unknown type, nested", () =>
			expectRefused(
				doc([block("Hero"), section(block("Carousel"))]),
				'Unknown block type "Carousel" at Section 2 › items › 1',
			));

		test("a text that is too long", () =>
			expectRefused(
				doc([
					block("Hero"),
					section(block("Heading", { text: "x".repeat(201) })),
				]),
				'Heading at Section 2 › items › 1: "text" is longer than 200 characters',
			));

		test("a bad select value", () =>
			expectRefused(
				doc([section(block("Heading", { size: "9" }))]),
				'Heading at Section 1 › items › 1: "size" must be one of: 1, 2, 3',
			));

		test("a value of the wrong type", () =>
			expectRefused(
				doc([section(block("Heading", { text: 5 }))]),
				'Heading at Section 1 › items › 1: "text" must be text',
			));

		test("an unknown prop", () =>
			expectRefused(
				doc([section(block("Heading", { colour: "red" }))]),
				'Heading at Section 1 › items › 1: unknown field "colour"',
			));

		test("a slot that isn't a list", () =>
			expectRefused(
				doc([block("Section", { items: "none" })]),
				'Section 1: "items" must be a list of blocks',
			));

		test("Hero inside Section", () =>
			expectRefused(
				doc([section(block("Hero"))]),
				"Hero can't go inside Section (Hero at Section 1 › items › 1)",
			));

		test("Section inside Columns", () =>
			expectRefused(
				doc([section(block("Columns", { column2: [section()] }))]),
				"Section can't go inside Columns (Section at Section 1 › items › Columns 1 › column2 › 1)",
			));

		test("Button at the top level", () =>
			expectRefused(
				doc([block("Hero"), block("Button")]),
				"Button can't go at the top level of a page (Button 2)",
			));

		test("a duplicate id across slots", () =>
			expectRefused(
				doc([
					section(
						block("Columns", {
							column1: [block("Heading", {}, "same")],
							column2: [block("Button", {}, "same")],
						}),
					),
				]),
				'Button at Section 1 › items › Columns 1 › column2 › 1: id "same" is used twice',
			));

		test("a block without an id", () =>
			expectRefused(
				doc([{ type: "Section", props: { items: [] } }]),
				"Section 1: needs an id",
			));

		test("a javascript: link in a Button", () =>
			expectRefused(
				doc([section(block("Button", { href: "javascript:alert(1)" }))]),
				'Button at Section 1 › items › 1: "href" is not a safe link',
			));

		test("an unsafe image src", () => {
			expectRefused(
				doc([section(block("Image", { src: "data:image/png;base64,AAAA" }))]),
				'Image at Section 1 › items › 1: "src" is not a safe image URL',
			);
			expectRefused(
				doc([block("Hero", { image: "javascript:alert(1)" })]),
				'Hero 1: "image" is not a safe image URL',
			);
		});

		test("more than 50 services", () =>
			expectRefused(
				doc([
					block("Services", {
						serviceIds: Array.from({ length: 51 }, (_, i) => `s${i}`),
					}),
				]),
				'Services 1: "serviceIds" holds more than 50 services',
			));
	});

	test("400 blocks are accepted and 401 are refused", () => {
		const headings = (count: number) =>
			Array.from({ length: count }, () => block("Heading"));
		expect(
			pageDocumentSchema.safeParse(doc([section(...headings(399))])).error,
		).toBeUndefined();
		expect(errorsOf(doc([section(...headings(400))]))).toEqual([
			"A page holds at most 400 blocks",
		]);
	});

	test("blocks nest 6 levels deep and no deeper", () => {
		const Box = defineBlock({
			label: "Box",
			fields: { items: field.slot({ allow: ["Box"] }) },
		});
		const schema = createPageDocumentSchema({
			blocks: { Box },
			rootAllow: ["Box"],
		});
		const nested = (depth: number): BlockNode =>
			block("Box", { items: depth > 1 ? [nested(depth - 1)] : [] });

		expect(schema.safeParse(doc([nested(6)])).error).toBeUndefined();
		expect(errorsOf(doc([nested(7)]), schema)).toEqual([
			"Box at Box 1 › items › Box 1 › items › Box 1 › items › Box 1 › items › Box 1 › items › 1: blocks nest at most 6 levels deep",
		]);
	});
});

describe("migrations", () => {
	const renameTitle: BlockMigration = ({ title, ...props }) =>
		title === undefined ? props : { ...props, text: props["text"] ?? title };
	const migrations = { Heading: [renameTitle] };

	const oldShape = () =>
		doc([
			section(
				block("Columns", {
					column1: [block("Heading", { title: "Old title", size: "1" }, "old")],
				}),
			),
		]);

	const headingIn = (value: unknown) => {
		const [outer] = (value as ReturnType<typeof doc>).data
			.content as BlockNode[];
		const [columns] = outer?.props["items"] as BlockNode[];
		return (columns?.props["column1"] as BlockNode[])[0];
	};

	test("an old-shape block nested in a slot is upgraded before validation", () => {
		expectRefused(oldShape(), 'unknown field "title"');
		const parsed = createPageDocumentSchema({ migrations }).parse(oldShape());
		expect(headingIn(parsed)?.props).toEqual({
			id: "old",
			text: "Old title",
			size: "1",
		});
	});

	test("applying a migration twice equals applying it once", () => {
		const once = migrateDocument(oldShape(), { migrations });
		expect(migrateDocument(once, { migrations })).toEqual(once);
		expect(headingIn(once)?.props).toEqual({
			id: "old",
			text: "Old title",
			size: "1",
		});
	});

	test("an already-current document is unchanged", () => {
		const current = salonDocument();
		const before = structuredClone(current);
		expect(migrateDocument(current, { migrations })).toEqual(before);
		expect(current).toEqual(before);
	});

	test("non-blocks and unknown shapes are left alone", () => {
		expect(migrateDocument("x", { migrations })).toBe("x");
		const odd = doc([null, { type: "Heading" }, 3]);
		expect(migrateDocument(odd, { migrations })).toEqual(odd);
	});
});

describe("blocksIn", () => {
	test("counts types and blocks through every slot, hidden columns included", () => {
		const { types, count } = blocksIn(salonDocument());
		expect([...types].sort()).toEqual(
			[
				"Button",
				"Columns",
				"Heading",
				"Hero",
				"Image",
				"RichText",
				"Section",
				"Services",
			].sort(),
		);
		expect(count).toBe(16);
	});
});
