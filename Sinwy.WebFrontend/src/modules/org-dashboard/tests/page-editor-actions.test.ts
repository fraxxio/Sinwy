import { describe, expect, it } from "bun:test";
import type { PuckAction, PuckApi } from "@puckeditor/core";
import { type BlockNode, pageDocumentSchema } from "@sinwy/shared";
import {
	blockTitle,
	canvasLabel,
	cloneBlock,
	deletedNotice,
	drawerGroups,
	moveTarget,
	parentSelector,
	placementFor,
	ROOT_ZONE,
	readingOrder,
	refusedDropNotice,
	type Selector,
	stepInReadingOrder,
	zoneContent,
} from "../components/page-editor/block-actions";
import { blockActions } from "../components/page-editor/use-block-actions";

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

describe("reading order", () => {
	const content = [
		section(),
		block("Section", "section-2", { items: [block("RichText", "text-2")] }),
	];
	const idAt = (selector: Selector | null) =>
		selector && zoneContent(content, selector.zone)?.[selector.index]?.props.id;
	const at = (id: string) =>
		readingOrder(content).find((selector) => idAt(selector) === id) ?? null;
	const step = (id: string | null, by: -1 | 1) =>
		idAt(stepInReadingOrder(content, id ? at(id) : null, by));

	it("lists each block before the blocks in its slots, depth first", () => {
		expect(readingOrder(content).map(idAt)).toEqual([
			"section-1",
			"heading-1",
			"columns-1",
			"image-1",
			"text-1",
			"button-1",
			"section-2",
			"text-2",
		]);
	});

	it("steps into, through and out of nested slots", () => {
		expect(step("section-1", 1)).toBe("heading-1");
		expect(step("columns-1", 1)).toBe("image-1");
		expect(step("text-1", 1)).toBe("button-1");
		expect(step("button-1", 1)).toBe("section-2");
		expect(step("section-2", -1)).toBe("button-1");
		expect(step("image-1", -1)).toBe("columns-1");
	});

	it("starts at the first or last block with nothing selected and stops at either end", () => {
		expect(step(null, 1)).toBe("section-1");
		expect(step(null, -1)).toBe("text-2");
		expect(step("section-1", -1)).toBeNull();
		expect(step("text-2", 1)).toBeNull();
	});

	it("skips the columns a Columns block doesn't show", () => {
		const columns = block("Columns", "columns-2", {
			count: "2",
			column1: [block("Image", "image-a")],
			column2: [],
			column3: [block("Image", "image-hidden")],
			column4: [],
		});
		const order = readingOrder([columns]).map(
			(selector) =>
				zoneContent([columns], selector.zone)?.[selector.index]?.props.id,
		);
		expect(order).toEqual(["columns-2", "image-a"]);
	});

	it("goes to the parent block, and to nothing at the top level", () => {
		expect(idAt(parentSelector(content, at("image-1") as Selector))).toBe(
			"columns-1",
		);
		expect(idAt(parentSelector(content, at("columns-1") as Selector))).toBe(
			"section-1",
		);
		expect(parentSelector(content, at("section-1") as Selector)).toBeNull();
	});
});

/** A stand-in for Puck's API over a fixed page that records what the actions dispatch. */
const fakePuck = (content: BlockNode[], selected: Selector | null) => {
	const dispatched: PuckAction[] = [];
	const puck = {
		appState: {
			data: { root: { props: {} }, content },
			ui: { itemSelector: selected },
		},
		selectedItem: selected
			? zoneContent(content, selected.zone)?.[selected.index]
			: null,
		dispatch: (action: PuckAction) => dispatched.push(action),
	};
	return {
		actions: blockActions(() => puck as unknown as PuckApi),
		dispatched,
	};
};

/** Puck records every dispatch but a `setUi`, and folds the ones made together into one history entry. */
const recorded = (actions: PuckAction[]) =>
	actions.filter(
		(action) => action.type !== "setUi" || action.recordHistory === true,
	);

describe("keyboard edits", () => {
	const content = () => [
		section(),
		block("Section", "section-2", { items: [] }),
	];

	it("deletes with one recorded dispatch, after clearing the selection", () => {
		const { actions, dispatched } = fakePuck(content(), {
			zone: ROOT_ZONE,
			index: 1,
		});
		actions.remove();
		expect(recorded(dispatched)).toEqual([
			{ type: "remove", zone: ROOT_ZONE, index: 1 },
		]);
		expect(dispatched[0]).toEqual({
			type: "setUi",
			ui: { itemSelector: null },
		});
	});

	it("moves with one recorded dispatch, the selection following the block", () => {
		const { actions, dispatched } = fakePuck(content(), {
			zone: ROOT_ZONE,
			index: 0,
		});
		actions.move(1);
		expect(recorded(dispatched)).toEqual([
			{
				type: "reorder",
				sourceIndex: 0,
				destinationIndex: 1,
				destinationZone: ROOT_ZONE,
			},
		]);
		expect(dispatched[0]).toEqual({
			type: "setUi",
			ui: { itemSelector: { zone: ROOT_ZONE, index: 1 } },
		});
	});

	it("dispatches nothing past the end of the slot or with nothing selected", () => {
		const last = fakePuck(content(), { zone: "section-1:items", index: 2 });
		last.actions.move(1);
		const none = fakePuck(content(), null);
		none.actions.remove();
		none.actions.move(-1);
		expect([...last.dispatched, ...none.dispatched]).toEqual([]);
	});

	it("Esc selects the parent, then deselects, without recording", () => {
		const nested = fakePuck(content(), { zone: "section-1:items", index: 1 });
		expect(nested.actions.escape()).toBe(true);
		const top = fakePuck(content(), { zone: ROOT_ZONE, index: 0 });
		expect(top.actions.escape()).toBe(true);
		expect(fakePuck(content(), null).actions.escape()).toBe(false);
		expect([...nested.dispatched, ...top.dispatched]).toEqual([
			{
				type: "setUi",
				ui: { itemSelector: { zone: ROOT_ZONE, index: 0 } },
			},
			{ type: "setUi", ui: { itemSelector: null } },
		]);
	});
});

describe("canvas names", () => {
	const content = () => [
		section(),
		block("Section", "section-2", {
			items: [block("Heading", "heading-2", { text: "  " })],
		}),
	];

	it("names a block after the first Heading directly in its slots", () => {
		expect(blockTitle(section())).toBe("Find us");
		expect(blockTitle(content()[1] as BlockNode)).toBeNull();
		expect(blockTitle(block("Heading", "h", { text: "Find us" }))).toBeNull();
		const sample = block("Heading", "h", { text: "Heading" });
		expect(blockTitle(block("Section", "s", { items: [sample] }))).toBeNull();
	});

	it("labels a titled block, the blocks inside it, and untitled blocks", () => {
		const labels = ["section-1", "heading-1", "image-1", "section-2", "nope"];
		expect(labels.map((id) => canvasLabel(content(), id))).toEqual([
			"Section · Find us",
			"Heading in Find us",
			"Image",
			"Section",
			null,
		]);
	});

	it("explains a drop the zone refuses, pointing to the titled block around it", () => {
		expect(refusedDropNotice(content(), "heading-1", ROOT_ZONE)).toBe(
			"This Heading can't go there on its own, so it stayed in “Find us”. To move the whole section, click ⮤ in the bar above the Heading, then drag the section by ⠿ or use Move up and Move down.",
		);
		expect(refusedDropNotice(content(), "heading-2", ROOT_ZONE)).toStartWith(
			"This Heading can't go there on its own, so it stayed in its section.",
		);
		expect(refusedDropNotice(content(), "section-1", "section-2:items")).toBe(
			"This Section can't go there.",
		);
	});

	it("says nothing for a drop the zone takes", () => {
		expect(refusedDropNotice(content(), "section-1", ROOT_ZONE)).toBeNull();
		expect(
			refusedDropNotice(content(), "heading-1", "section-2:items"),
		).toBeNull();
	});
});

describe("deletedNotice", () => {
	const photos = (count: number) =>
		block("Photos", "photos-1", {
			items: Array.from({ length: count }, (_, i) =>
				block("Image", `photo-${i}`, { src: `/${i}.jpg` }),
			),
		});
	const salon = block("Section", "salon", {
		items: [
			block("Heading", "salon-heading", { text: "Inside the salon" }),
			photos(2),
		],
	});

	it("names a Section by its Heading and says what it held", () => {
		expect(deletedNotice([salon], salon)).toEqual({
			title: "Deleted Section · Inside the salon",
			description: "With 2 photos and 1 more block inside",
		});
		expect(deletedNotice([section()], section())).toEqual({
			title: "Deleted Section · Find us",
			description: "With 1 photo and 4 more blocks inside",
		});
	});

	it("counts the photos of a Photos block", () => {
		expect(deletedNotice([salon], photos(4))).toEqual({
			title: "Deleted Photos in Inside the salon",
			description: "With 4 photos",
		});
	});

	it("gives a single block a title and no description", () => {
		const hours = block("Heading", "hours", { text: "Opening hours" });
		const findUs = section();
		findUs.props["items"] = [...(findUs.props["items"] as BlockNode[]), hours];
		expect(deletedNotice([findUs], hours)).toEqual({
			title: "Deleted Heading in Find us",
		});
		const text = block("RichText", "text-9");
		expect(deletedNotice([text], text)).toEqual({ title: "Deleted Text" });
	});

	it("names the Heading that titles its section by its own text", () => {
		const title = block("Heading", "heading-1", { text: "Find us" });
		expect(deletedNotice([section()], title)).toEqual({
			title: "Deleted Heading · Find us",
		});
	});

	it("names a Section with no Heading by its label and counts its blocks", () => {
		const bare = block("Section", "bare", {
			items: [block("RichText", "a"), block("Button", "b")],
		});
		expect(deletedNotice([bare], bare)).toEqual({
			title: "Deleted Section",
			description: "With 2 blocks inside",
		});
	});
});

describe("undo and redo", () => {
	/** Puck's history over two data states, with the latest edit recorded or still waiting for its 250 ms. */
	const fakeHistory = (pending: boolean) => {
		const saved = { root: { props: {} }, content: [] as BlockNode[] };
		const edited = { root: { props: {} }, content: [section()] };
		const travels: string[] = [];
		const history = {
			histories: [{ state: { data: saved } }],
			index: 0,
			back: () => travels.push(`back from ${history.index}`),
			forward: () => travels.push(`forward from ${history.index}`),
		};
		const record = () => {
			history.histories.push({ state: { data: edited } });
			history.index = 1;
		};
		if (!pending) record();
		const puck = { appState: { data: edited }, history };
		return {
			actions: blockActions(() => puck as unknown as PuckApi),
			record,
			travels,
		};
	};

	it("travels at once when the last edit is recorded", () => {
		const { actions, travels } = fakeHistory(false);
		expect(actions.historyPending()).toBe(false);
		void actions.undo();
		void actions.redo();
		expect(travels).toEqual(["back from 1", "forward from 1"]);
	});

	it("waits for the last edit to be recorded, so undo reverts that edit", async () => {
		const { actions, record, travels } = fakeHistory(true);
		expect(actions.historyPending()).toBe(true);
		const undone = actions.undo();
		expect(travels).toEqual([]);
		setTimeout(record, 120);
		await undone;
		expect(travels).toEqual(["back from 1"]);
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
