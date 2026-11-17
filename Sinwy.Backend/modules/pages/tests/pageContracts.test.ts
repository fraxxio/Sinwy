import { describe, expect, test } from "bun:test";
import {
	EMPTY_ORGANIZATION_PROFILE,
	gatedTypesIn,
	type OrganizationProfileDto,
	PAGE_CONTENT_LIMITS,
	PAGE_TEMPLATE_IDS,
	PAGE_TEMPLATES,
	type PageContent,
	type PageWidget,
	PUCK_LIMITS,
	pageContentSchema,
	pageSlugSchema,
	RESERVED_PAGE_SLUGS,
	savePageContentSchema,
	WIDGET_TYPES,
} from "@sinwy/shared";

const widget = (id: string, children?: PageWidget[]): PageWidget => ({
	id,
	type: "text",
	props: { text: id },
	...(children && { children }),
});

const nested = (depth: number): PageWidget =>
	depth === 1 ? widget("b1") : widget(`b${depth}`, [nested(depth - 1)]);

const parse = (widgets: unknown[]) =>
	pageContentSchema.safeParse({ schemaVersion: 1, widgets });

const profile: OrganizationProfileDto = {
	tagline: "Calm haircuts in the old town",
	description: "A small barbershop with two chairs.",
	email: "hello@example.com",
	phone: "+370 600 00000",
	website: "https://example.com",
	city: "Vilnius",
	country: "LT",
};

describe("page content schema", () => {
	test("accepts every registered widget type", () => {
		const widgets = Object.keys(WIDGET_TYPES).map((type) => ({
			id: type,
			type,
			props: {},
		}));
		expect(parse(widgets).success).toBe(true);
	});

	test("rejects an unknown widget type, nested ones included", () => {
		expect(parse([{ id: "x", type: "script", props: {} }]).success).toBe(false);
		expect(
			parse([
				{ ...widget("a"), children: [{ id: "x", type: "script", props: {} }] },
			]).success,
		).toBe(false);
	});

	test(`allows ${PAGE_CONTENT_LIMITS.maxDepth} levels and refuses one more`, () => {
		expect(parse([nested(PAGE_CONTENT_LIMITS.maxDepth)]).success).toBe(true);
		expect(parse([nested(PAGE_CONTENT_LIMITS.maxDepth + 1)]).success).toBe(
			false,
		);
	});

	test(`counts widgets across the tree, up to ${PAGE_CONTENT_LIMITS.maxWidgets}`, () => {
		const max = PAGE_CONTENT_LIMITS.maxWidgets;
		const flat = (n: number) =>
			Array.from({ length: n }, (_, i) => widget(`b${i}`));
		expect(parse(flat(max)).success).toBe(true);
		expect(parse(flat(max + 1)).success).toBe(false);

		const half = max / 2;
		const children = Array.from({ length: half }, (_, i) => widget(`c${i}`));
		const parents = Array.from({ length: half }, (_, i) =>
			widget(`p${i}`, i === 0 ? children : undefined),
		);
		expect(parse(parents).success).toBe(true);
		expect(parse([...parents, widget("extra")]).success).toBe(false);
	});

	test("rejects a widget id used twice", () => {
		expect(parse([widget("a"), widget("b", [widget("a")])]).success).toBe(
			false,
		);
	});

	test("rejects the old blocks key, alone or next to widgets", () => {
		const blocks = [widget("a")];
		expect(
			pageContentSchema.safeParse({ schemaVersion: 1, blocks }).success,
		).toBe(false);
		expect(
			pageContentSchema.safeParse({ schemaVersion: 1, widgets: [], blocks })
				.success,
		).toBe(false);
	});
});

describe("page content v2 (Puck)", () => {
	const block = (type: string, props: Record<string, unknown> = {}) => ({
		type,
		props: { id: `${type}-${crypto.randomUUID()}`, ...props },
	});

	const doc = (content: unknown[], root: Record<string, unknown> = {}) => ({
		schemaVersion: 2 as const,
		data: { root: { props: root }, content, zones: {} },
	});

	const parseDoc = (content: unknown[], root?: Record<string, unknown>) =>
		pageContentSchema.safeParse(doc(content, root));

	const messages = (content: unknown[]) => {
		const parsed = parseDoc(content);
		return parsed.success
			? []
			: parsed.error.issues.flatMap((issue) =>
					"errors" in issue
						? (issue.errors as { message: string }[][])
								.flat()
								.map((e) => e.message)
						: [issue.message],
				);
	};

	const everyBlock = [
		block("Hero", {
			image: "https://example.com/a.jpg",
			align: "center",
			items: [
				block("Heading", {
					text: "Hi",
					size: "1",
					align: { base: "center", mobile: "start" },
				}),
				block("RichText", {
					content: '<p>See <a href="/acme/book">times</a></p>',
				}),
				block("Button", { label: "Book", href: "book", variant: "outline" }),
			],
		}),
		block("ServicesSection", {
			tone: "muted",
			padding: { base: "large", mobile: "small" },
			items: [block("BookingWidget", { title: "Book", serviceIds: ["s-1"] })],
		}),
		block("Section", {
			visibility: { base: "show", mobile: "hide" },
			items: [
				block("Columns", {
					count: { base: "3", mobile: "1" },
					column1: [block("Image", { src: "/a.png", alt: "", aspect: "wide" })],
					column2: [],
					column3: [
						block("Container", {
							width: "narrow",
							align: { base: "start" },
							items: [
								block("FreeGrid", {
									layout: {
										desktop: { a: { x: 0, y: 0, w: 6, h: 2 } },
										mobile: {},
									},
									items: [block("Heading", { text: "Deep" })],
								}),
							],
						}),
					],
					column4: [],
				}),
			],
		}),
	];

	test("accepts every block, responsive and plain values, and the root tokens", () => {
		expect(
			parseDoc(everyBlock, { radius: "large", spacing: "compact" }).success,
		).toBe(true);
	});

	test("round-trips through the save schema unchanged", () => {
		const body = {
			baseVersion: 3,
			content: doc(everyBlock, { radius: "small" }),
		};
		const parsed = savePageContentSchema.safeParse(body);
		expect(parsed.success).toBe(true);
		expect(parsed.data as unknown).toEqual(body);
	});

	test("refuses an unknown type, nested ones included", () => {
		expect(messages([block("Section", { items: [block("Marquee")] })])).toEqual(
			['Unknown block type "Marquee"'],
		);
	});

	test("refuses a bad prop value, an unknown prop and a slot that isn't a list", () => {
		expect(parseDoc([block("Heading", { size: "7" })]).success).toBe(false);
		expect(
			parseDoc([block("Section", { padding: { base: "huge" } })]).success,
		).toBe(false);
		expect(parseDoc([block("Heading", { onClick: "alert(1)" })]).success).toBe(
			false,
		);
		expect(parseDoc([block("Section", { items: "<script>" })]).success).toBe(
			false,
		);
		expect(parseDoc([block("Heading", { visibility: "gone" })]).success).toBe(
			false,
		);
		expect(parseDoc([], { theme: "dark" }).success).toBe(false);
	});

	test("refuses javascript: and other unsafe URLs", () => {
		for (const bad of [
			block("Button", { href: "javascript:alert(1)" }),
			block("Button", { href: " JavaScript:alert(1)" }),
			block("Image", { src: "javascript:alert(1)" }),
			block("Image", { src: "data:image/svg+xml,<svg/>" }),
			block("Hero", { image: "javascript:alert(1)" }),
			block("RichText", {
				content: '<p><a href="javascript:alert(1)">x</a></p>',
			}),
			block("RichText", {
				content: "<a href='&#106;avascript:alert(1)'>x</a>",
			}),
		])
			expect(parseDoc([bad]).success).toBe(false);
	});

	test("refuses an id used twice, across slots", () => {
		const twin = block("Heading");
		expect(messages([twin, block("Section", { items: [twin] })])).toEqual([
			`Block id "${twin.props.id}" is used twice`,
		]);
	});

	test(`allows ${PUCK_LIMITS.maxDepth} levels and refuses one more`, () => {
		const nest = (depth: number): unknown =>
			depth === 1
				? block("Heading")
				: block("Container", { items: [nest(depth - 1)] });
		expect(parseDoc([nest(PUCK_LIMITS.maxDepth)]).success).toBe(true);
		expect(messages([nest(PUCK_LIMITS.maxDepth + 1)])).toEqual([
			`Blocks nest at most ${PUCK_LIMITS.maxDepth} levels deep`,
		]);
	});

	test(`counts blocks across slots, up to ${PUCK_LIMITS.maxComponents}`, () => {
		const max = PUCK_LIMITS.maxComponents;
		const section = (count: number) =>
			block("Section", {
				items: Array.from({ length: count - 1 }, () => block("Heading")),
			});
		expect(parseDoc([section(max / 2), section(max / 2)]).success).toBe(true);
		expect(messages([section(max / 2), section(max / 2 + 1)])).toEqual([
			`A page holds at most ${max} blocks`,
		]);
	});

	test("refuses a v2 body without a content array, with widgets or with drop zones", () => {
		const base = doc([]);
		const bad = [
			{ ...base, data: { root: {} } },
			{
				...base,
				data: { ...base.data, content: [{ type: "Heading", props: {} }] },
			},
			{ schemaVersion: 2, widgets: [] },
			{ ...base, widgets: [] },
			{
				...base,
				data: {
					...base.data,
					zones: { "Section-1:items": [block("Heading")] },
				},
			},
		];
		for (const candidate of bad)
			expect(
				savePageContentSchema.safeParse({ baseVersion: 1, content: candidate })
					.success,
			).toBe(false);
	});

	test("migrates the old Heading level to size on save, nested ones included", () => {
		const old = block("Heading", { text: "Hi", level: "1" });
		const parsed = parseDoc([
			block("Section", { items: [old] }),
			block("Heading", { size: "3", level: "1" }),
		]);
		expect(parsed.success).toBe(true);
		const content = (
			parsed.data as { data: { content: { props: Record<string, unknown> }[] } }
		).data.content;
		expect(
			(content[0]?.props["items"] as { props: unknown }[])[0]?.props,
		).toEqual({
			id: old.props.id,
			text: "Hi",
			size: "1",
		});
		expect(content[1]?.props).toMatchObject({ size: "3" });
		expect(content[1]?.props).not.toHaveProperty("level");
	});

	test("finds gated blocks in slots, and gated widgets in version 1", () => {
		const parsed = parseDoc(everyBlock);
		expect(gatedTypesIn(parsed.data as PageContent)).toEqual(
			new Map([["BookingWidget", "advanced-widgets"]]),
		);
		expect(gatedTypesIn(doc([block("Heading")]) as PageContent).size).toBe(0);
		expect(
			gatedTypesIn({
				schemaVersion: 1,
				widgets: [{ id: "g", type: "gallery", props: {} }],
			}),
		).toEqual(new Map([["gallery", "advanced-widgets"]]));
	});
});

describe("page templates", () => {
	for (const id of PAGE_TEMPLATE_IDS)
		test(`${id} builds valid content with and without a profile`, () => {
			for (const input of [profile, EMPTY_ORGANIZATION_PROFILE]) {
				const result = pageContentSchema.safeParse(
					PAGE_TEMPLATES[id].build(input),
				);
				expect(result.error).toBeUndefined();
			}
		});

	test("about prefills the tagline and the contact details", () => {
		const text = JSON.stringify(PAGE_TEMPLATES.about.build(profile));
		expect(text).toContain(profile.tagline as string);
		expect(text).toContain("Vilnius, Lithuania");
		expect(text).toContain("hello@example.com");
	});

	test("only advanced-widgets templates use advanced widgets", () => {
		for (const id of PAGE_TEMPLATE_IDS) {
			const template = PAGE_TEMPLATES[id];
			const { widgets } = template.build(profile);
			const needs = widgets.flatMap((w) => WIDGET_TYPES[w.type].requires ?? []);
			for (const feature of needs) expect(template.requires).toBe(feature);
		}
	});
});

describe("page slug schema", () => {
	for (const slug of RESERVED_PAGE_SLUGS)
		test(`refuses the reserved slug "${slug}"`, () => {
			expect(pageSlugSchema.safeParse(slug).success).toBe(false);
		});

	test("takes lowercase letters, digits and single inner hyphens", () => {
		for (const slug of ["about", "about-us", "team-2026", "a"])
			expect(pageSlugSchema.safeParse(slug).success).toBe(true);
		for (const slug of [
			"",
			"About",
			"about us",
			"-about",
			"about-",
			"a--b",
			"ä",
		])
			expect(pageSlugSchema.safeParse(slug).success).toBe(false);
		expect(pageSlugSchema.safeParse("a".repeat(61)).success).toBe(false);
	});
});
