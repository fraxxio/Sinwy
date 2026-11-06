import { describe, expect, test } from "bun:test";
import {
	BLOCK_TYPES,
	EMPTY_ORGANIZATION_PROFILE,
	type OrganizationProfileDto,
	PAGE_CONTENT_LIMITS,
	PAGE_TEMPLATE_IDS,
	PAGE_TEMPLATES,
	type PageBlock,
	pageContentSchema,
	pageSlugSchema,
	RESERVED_PAGE_SLUGS,
} from "@sinwy/shared";

const block = (id: string, children?: PageBlock[]): PageBlock => ({
	id,
	type: "text",
	props: { text: id },
	...(children && { children }),
});

const nested = (depth: number): PageBlock =>
	depth === 1 ? block("b1") : block(`b${depth}`, [nested(depth - 1)]);

const parse = (blocks: unknown[]) =>
	pageContentSchema.safeParse({ schemaVersion: 1, blocks });

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
	test("accepts every registered block type", () => {
		const blocks = Object.keys(BLOCK_TYPES).map((type) => ({
			id: type,
			type,
			props: {},
		}));
		expect(parse(blocks).success).toBe(true);
	});

	test("rejects an unknown block type, nested ones included", () => {
		expect(parse([{ id: "x", type: "script", props: {} }]).success).toBe(false);
		expect(
			parse([
				{ ...block("a"), children: [{ id: "x", type: "script", props: {} }] },
			]).success,
		).toBe(false);
	});

	test(`allows ${PAGE_CONTENT_LIMITS.maxDepth} levels and refuses one more`, () => {
		expect(parse([nested(PAGE_CONTENT_LIMITS.maxDepth)]).success).toBe(true);
		expect(parse([nested(PAGE_CONTENT_LIMITS.maxDepth + 1)]).success).toBe(
			false,
		);
	});

	test(`counts blocks across the tree, up to ${PAGE_CONTENT_LIMITS.maxBlocks}`, () => {
		const max = PAGE_CONTENT_LIMITS.maxBlocks;
		const flat = (n: number) =>
			Array.from({ length: n }, (_, i) => block(`b${i}`));
		expect(parse(flat(max)).success).toBe(true);
		expect(parse(flat(max + 1)).success).toBe(false);

		const half = max / 2;
		const children = Array.from({ length: half }, (_, i) => block(`c${i}`));
		const parents = Array.from({ length: half }, (_, i) =>
			block(`p${i}`, i === 0 ? children : undefined),
		);
		expect(parse(parents).success).toBe(true);
		expect(parse([...parents, block("extra")]).success).toBe(false);
	});

	test("rejects a block id used twice", () => {
		expect(parse([block("a"), block("b", [block("a")])]).success).toBe(false);
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

	test("only page-builder templates use page-builder blocks", () => {
		for (const id of PAGE_TEMPLATE_IDS) {
			const template = PAGE_TEMPLATES[id];
			const { blocks } = template.build(profile);
			const needs = blocks.flatMap((b) => BLOCK_TYPES[b.type].requires ?? []);
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
