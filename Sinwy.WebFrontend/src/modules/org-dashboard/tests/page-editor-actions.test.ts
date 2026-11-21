import { describe, expect, it } from "bun:test";
import { type BlockNode, pageDocumentSchema } from "@sinwy/shared";
import {
	cloneBlock,
	drawerGroups,
	moveTarget,
	placementFor,
	ROOT_ZONE,
	zoneContent,
} from "../components/page-editor/block-actions";

const block = (
	type: string,
	id: string,
	props: Record<string, unknown> = {},
): BlockNode => ({ type, props: { id, ...props } });

const section = () =>
	block("Section", "section-1", {
		items: [
			block("Heading", "heading-1", { text: "Find us" }),
			block("Columns", "columns-1", {
				column1: [block("Image", "image-1", { src: "/a.jpg" })],
				column2: [block("RichText", "text-1", { content: "<p>Hi</p>" })],
				column3: [],
				column4: [],
			}),
			block("Button", "button-1"),
		],
	});

const idsIn = (node: BlockNode): string[] => [
	node.props.id,
	...Object.values(node.props)
		.filter(Array.isArray)
		.flatMap((children) => (children as BlockNode[]).flatMap(idsIn)),
];

describe("cloneBlock", () => {
	it("gives the block and every nested block a fresh id", () => {
		const original = section();
		const copy = cloneBlock(original);
		const before = idsIn(original);
		const after = idsIn(copy);

		expect(after).toHaveLength(before.length);
		expect(new Set(after).size).toBe(after.length);
		for (const id of after) expect(before).not.toContain(id);
		expect(idsIn(original)).toEqual(before);
	});

	it("keeps every other prop", () => {
		const copy = cloneBlock(section());
		const columns = (copy.props["items"] as BlockNode[])[1];
		const image = (columns?.props["column1"] as BlockNode[])[0];
		expect(image?.props["src"]).toBe("/a.jpg");
		expect((copy.props["items"] as BlockNode[]).map((b) => b.type)).toEqual([
			"Heading",
			"Columns",
			"Button",
		]);
	});

	it("leaves a document that passes the schema next to the original", () => {
		const original = section();
		const result = pageDocumentSchema.safeParse({
			schemaVersion: 2,
			data: { root: { props: {} }, content: [original, cloneBlock(original)] },
		});
		expect(result.error?.issues).toBeUndefined();
	});
});

describe("moveTarget", () => {
	const content = [section(), block("Hero", "hero-1", { items: [] })];
	const items = { zone: "section-1:items", index: 0 };

	it("moves one step within the slot", () => {
		expect(moveTarget(content, items, 1)).toBe(1);
		expect(moveTarget(content, { ...items, index: 1 }, -1)).toBe(0);
		expect(moveTarget(content, { zone: ROOT_ZONE, index: 0 }, 1)).toBe(1);
	});

	it("does nothing at either end of the slot", () => {
		expect(moveTarget(content, items, -1)).toBeNull();
		expect(moveTarget(content, { ...items, index: 2 }, 1)).toBeNull();
		expect(moveTarget(content, { zone: ROOT_ZONE, index: 1 }, 1)).toBeNull();
	});

	it("counts the nested slot's blocks, not the page's", () => {
		const column = { zone: "columns-1:column1", index: 0 };
		expect(moveTarget(content, column, 1)).toBeNull();
		expect(zoneContent(content, "columns-1:column2")).toHaveLength(1);
	});

	it("finds nothing for an unknown zone or a prop that isn't a slot", () => {
		expect(zoneContent(content, "missing:items")).toBeUndefined();
		expect(zoneContent(content, "heading-1:text")).toBeUndefined();
	});
});

describe("placementFor", () => {
	const page = (): BlockNode[] => [
		block("Section", "s1", {
			items: [
				block("RichText", "text-1"),
				block("Image", "image-1"),
				block("Photos", "photos-1", {
					items: [block("Image", "photo-1"), block("Image", "photo-2")],
				}),
			],
		}),
		block("Section", "s2", { items: [] }),
	];

	it("puts a block right after the selected one in the same slot", () => {
		expect(
			placementFor(page(), "Image", { zone: "s1:items", index: 0 }),
		).toEqual({ zone: "s1:items", index: 1 });
		expect(
			placementFor(page(), "Heading", { zone: "s1:items", index: 1 }),
		).toEqual({ zone: "s1:items", index: 2 });
	});

	it("walks up to the closest ancestor slot that takes the type", () => {
		expect(
			placementFor(page(), "Heading", { zone: "photos-1:items", index: 0 }),
		).toEqual({ zone: "s1:items", index: 3 });
		expect(
			placementFor(page(), "Hero", { zone: "s1:items", index: 1 }),
		).toEqual({ zone: ROOT_ZONE, index: 1 });
	});

	it("fills the selected block's own slot when it takes the type", () => {
		expect(
			placementFor(page(), "Image", { zone: ROOT_ZONE, index: 1 }),
		).toEqual({ zone: "s2:items", index: 0 });
		expect(
			placementFor(page(), "Image", { zone: "s1:items", index: 2 }),
		).toEqual({ zone: "photos-1:items", index: 2 });
		expect(
			placementFor(page(), "Heading", { zone: "s1:items", index: 2 }),
		).toEqual({ zone: "s1:items", index: 3 });
	});

	it("goes to the end of the page with nothing selected", () => {
		expect(placementFor(page(), "Hero", null)).toEqual({
			zone: ROOT_ZONE,
			index: 2,
		});
		expect(placementFor([], "Hero", null)).toEqual({
			zone: ROOT_ZONE,
			index: 0,
		});
	});

	it("goes to the end of the page when no slot takes the type", () => {
		expect(
			placementFor(page(), "Unknown", { zone: "s1:items", index: 1 }),
		).toEqual({ zone: ROOT_ZONE, index: 2 });
	});

	it("wraps a block the top level refuses in a new Section", () => {
		expect(placementFor(page(), "Image", null)).toEqual({
			zone: ROOT_ZONE,
			index: 2,
			wrap: true,
		});
		const withHero = [block("Hero", "hero-1", { items: [] }), ...page()];
		expect(
			placementFor(withHero, "Image", { zone: ROOT_ZONE, index: 0 }),
		).toEqual({ zone: ROOT_ZONE, index: 1, wrap: true });
	});
});

describe("drawerGroups", () => {
	const tiles = (features: Parameters<typeof drawerGroups>[0]) =>
		drawerGroups(features).flatMap((group) => group.tiles);

	it("lists Ready-made, Content and Layout in that order", () => {
		expect(drawerGroups([]).map((group) => group.title)).toEqual([
			"Ready-made",
			"Content",
			"Layout",
		]);
		expect(drawerGroups([])[0]?.tiles.map((tile) => tile.type)).toEqual([
			"Hero",
			"Services",
			"Photos",
			"Booking",
		]);
	});

	it("locks a block whose feature the plan lacks", () => {
		const booking = tiles([]).find((tile) => tile.type === "Booking");
		expect(booking?.lockedBy).toBe("premium-blocks");
		expect(tiles([]).filter((tile) => tile.lockedBy)).toHaveLength(1);
	});

	it("unlocks it once the plan has the feature", () => {
		expect(tiles(["premium-blocks"]).every((tile) => !tile.lockedBy)).toBe(
			true,
		);
	});
});
