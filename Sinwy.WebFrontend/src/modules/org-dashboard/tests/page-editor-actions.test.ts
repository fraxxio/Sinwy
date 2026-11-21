import { describe, expect, it } from "bun:test";
import { type BlockNode, pageDocumentSchema } from "@sinwy/shared";
import {
	cloneBlock,
	moveTarget,
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
