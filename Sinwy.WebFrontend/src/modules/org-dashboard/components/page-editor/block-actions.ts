import {
	BLOCKS,
	type BlockGroup,
	type BlockNode,
	type Blocks,
	type Feature,
	isSlotField,
	ownEntry,
	ROOT_ALLOW,
} from "@sinwy/shared";

export const ROOT_ZONE = "root:default-zone";

export type Selector = { zone: string; index: number };

export const newBlockId = (type: string) => `${type}-${crypto.randomUUID()}`;

const slotsOf = (block: BlockNode, blocks: Blocks) =>
	ownEntry(blocks, block.type)?.slots ?? [];

const childrenIn = (block: BlockNode, slot: string): BlockNode[] => {
	const children = block.props[slot];
	return Array.isArray(children) ? children : [];
};

/** A copy of a block with fresh ids for it and every block in its slots. */
export function cloneBlock(
	block: BlockNode,
	blocks: Blocks = BLOCKS,
): BlockNode {
	const copy = structuredClone(block);
	const reassign = (node: BlockNode) => {
		node.props.id = newBlockId(node.type);
		for (const slot of slotsOf(node, blocks))
			for (const child of childrenIn(node, slot)) reassign(child);
	};
	reassign(copy);
	return copy;
}

const splitZone = (zone: string) => {
	const split = zone.lastIndexOf(":");
	return { parentId: zone.slice(0, split), slot: zone.slice(split + 1) };
};

function findBlock(
	content: readonly BlockNode[],
	id: string,
	blocks: Blocks,
): BlockNode | undefined {
	for (const block of content) {
		if (block.props.id === id) return block;
		for (const slot of slotsOf(block, blocks)) {
			const found = findBlock(childrenIn(block, slot), id, blocks);
			if (found) return found;
		}
	}
	return undefined;
}

/** The blocks of a zone, `root:default-zone` or `<parent id>:<slot>`. */
export function zoneContent(
	content: readonly BlockNode[],
	zone: string,
	blocks: Blocks = BLOCKS,
): readonly BlockNode[] | undefined {
	if (zone === ROOT_ZONE) return content;
	const { parentId, slot } = splitZone(zone);
	const parent = findBlock(content, parentId, blocks);
	return parent && slotsOf(parent, blocks).includes(slot)
		? childrenIn(parent, slot)
		: undefined;
}

/** Whether a zone's `allow` list lets a block type in, as the server checks it on save. */
export function slotAccepts(
	content: readonly BlockNode[],
	zone: string,
	type: string,
	blocks: Blocks = BLOCKS,
	rootAllow: readonly string[] = ROOT_ALLOW,
): boolean {
	if (zone === ROOT_ZONE) return rootAllow.includes(type);
	const { parentId, slot } = splitZone(zone);
	const parent = findBlock(content, parentId, blocks);
	const field = parent && ownEntry(blocks, parent.type)?.fields[slot];
	return !!field && isSlotField(field) && field.allow.includes(type);
}

function findWithParent(
	content: readonly BlockNode[],
	id: string,
	blocks: Blocks,
	parent: BlockNode | null = null,
): { block: BlockNode; parent: BlockNode | null } | undefined {
	for (const block of content) {
		if (block.props.id === id) return { block, parent };
		for (const slot of slotsOf(block, blocks)) {
			const found = findWithParent(childrenIn(block, slot), id, blocks, block);
			if (found) return found;
		}
	}
	return undefined;
}

const labelOf = (type: string, blocks: Blocks) =>
	ownEntry(blocks, type)?.label ?? type;

/** The text of the first Heading directly in a block's slots, which is how an owner tells their Sections apart; sample text doesn't count. */
export function blockTitle(
	block: BlockNode,
	blocks: Blocks = BLOCKS,
): string | null {
	const sample = ownEntry(blocks, "Heading")?.fields["text"];
	for (const slot of slotsOf(block, blocks))
		for (const child of childrenIn(block, slot)) {
			const text = child.type === "Heading" ? child.props["text"] : null;
			if (typeof text !== "string" || !text.trim()) continue;
			if (sample?.placeholder && text.trim() === sample.default) continue;
			return text.trim();
		}
	return null;
}

/** "Section · Find us" for a titled block, "Heading in Find us" for a block inside one, else the block's label. */
export function canvasLabel(
	content: readonly BlockNode[],
	id: string,
	blocks: Blocks = BLOCKS,
): string | null {
	const found = findWithParent(content, id, blocks);
	if (!found) return null;
	const label = labelOf(found.block.type, blocks);
	const own = blockTitle(found.block, blocks);
	if (own) return `${label} · ${own}`;
	const around = found.parent && blockTitle(found.parent, blocks);
	return around ? `${label} in ${around}` : label;
}

const inside = (block: BlockNode, blocks: Blocks): BlockNode[] =>
	slotsOf(block, blocks).flatMap((slot) =>
		childrenIn(block, slot).flatMap((child) => [
			child,
			...inside(child, blocks),
		]),
	);

const counted = (count: number, noun: string) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

/** The toast after a delete: the block's name on the canvas and, for a block that held others, what went with it. */
export function deletedNotice(
	content: readonly BlockNode[],
	block: BlockNode,
	blocks: Blocks = BLOCKS,
): { title: string; description?: string } {
	const name =
		canvasLabel(content, block.props.id, blocks) ??
		blockTitle(block, blocks) ??
		labelOf(block.type, blocks);
	const title = `Deleted ${name}`;
	const held = inside(block, blocks);
	const photos = held.filter(({ type }) => type === "Image").length;
	const others = held.filter(
		({ type }) => type !== "Image" && type !== "Photos",
	).length;
	if (photos && others)
		return {
			title,
			description: `With ${counted(photos, "photo")} and ${counted(others, "more block")} inside`,
		};
	if (photos) return { title, description: `With ${counted(photos, "photo")}` };
	if (others)
		return { title, description: `With ${counted(others, "block")} inside` };
	return { title };
}

/** What to tell the owner when a block is dropped on a zone that doesn't take it, so Puck kept it where it was. */
export function refusedDropNotice(
	content: readonly BlockNode[],
	draggedId: string,
	zone: string,
	blocks: Blocks = BLOCKS,
	rootAllow: readonly string[] = ROOT_ALLOW,
): string | null {
	const found = findWithParent(content, draggedId, blocks);
	if (!found || slotAccepts(content, zone, found.block.type, blocks, rootAllow))
		return null;
	const label = labelOf(found.block.type, blocks);
	if (!found.parent) return `This ${label} can't go there.`;
	const parent = labelOf(found.parent.type, blocks).toLowerCase();
	const around = blockTitle(found.parent, blocks);
	const stayed = `This ${label} can't go there on its own, so it stayed in ${around ? `“${around}”` : `its ${parent}`}.`;
	return `${stayed} To move the whole ${parent}, click ⮤ in the bar above the ${label}, then drag the ${parent} by ⠿ or use Move up and Move down.`;
}

/** The top-level block a new block is wrapped in when it can't go at the top level itself. */
export const WRAPPER = { type: "Section", slot: "items" } as const;

export type Placement = Selector & {
	/** The block goes into a new Section placed here, since the top level refuses it. */
	wrap?: boolean;
};

/**
 * Where clicking a drawer card puts a block: at the end of the selected block's first slot that takes the type,
 * otherwise right after the selected block in the closest zone up through its ancestors that takes it, or at the
 * end of the page with nothing selected. A type only a Section takes is wrapped in a new Section at the top level.
 */
export function placementFor(
	content: readonly BlockNode[],
	type: string,
	selected: Selector | null,
	blocks: Blocks = BLOCKS,
	rootAllow: readonly string[] = ROOT_ALLOW,
): Placement {
	const item = selected
		? zoneContent(content, selected.zone, blocks)?.[selected.index]
		: undefined;
	const inside = item
		? slotsOf(item, blocks)
				.map((slot) => ({
					zone: `${item.props.id}:${slot}`,
					index: childrenIn(item, slot).length,
				}))
				.find(({ zone }) => slotAccepts(content, zone, type, blocks, rootAllow))
		: undefined;
	if (inside) return inside;
	let at: Selector = selected ?? { zone: ROOT_ZONE, index: content.length - 1 };
	while (at.zone !== ROOT_ZONE) {
		if (slotAccepts(content, at.zone, type, blocks, rootAllow))
			return { zone: at.zone, index: at.index + 1 };
		const { parentId } = splitZone(at.zone);
		const parent = selectorFor(content, parentId, blocks);
		if (!parent) break;
		at = parent;
	}
	const index = at.zone === ROOT_ZONE ? at.index + 1 : content.length;
	if (rootAllow.includes(type)) return { zone: ROOT_ZONE, index };
	const wrapper = ownEntry(blocks, WRAPPER.type)?.fields[WRAPPER.slot];
	return wrapper && isSlotField(wrapper) && wrapper.allow.includes(type)
		? { zone: ROOT_ZONE, index, wrap: true }
		: { zone: ROOT_ZONE, index: content.length };
}

/** The zone and index of the block with this id. */
export function selectorFor(
	content: readonly BlockNode[],
	id: string,
	blocks: Blocks = BLOCKS,
	zone: string = ROOT_ZONE,
): Selector | undefined {
	for (const [index, block] of content.entries()) {
		if (block.props.id === id) return { zone, index };
		for (const slot of slotsOf(block, blocks)) {
			const found = selectorFor(
				childrenIn(block, slot),
				id,
				blocks,
				`${block.props.id}:${slot}`,
			);
			if (found) return found;
		}
	}
	return undefined;
}

/** Where a block moves one step up or down within its own slot; `null` at either end. */
export function moveTarget(
	content: readonly BlockNode[],
	{ zone, index }: Selector,
	step: -1 | 1,
	blocks: Blocks = BLOCKS,
): number | null {
	const siblings = zoneContent(content, zone, blocks);
	const target = index + step;
	return siblings && target >= 0 && target < siblings.length ? target : null;
}

/** The slots the canvas shows: Columns renders only its first `count` columns. */
const shownSlots = (block: BlockNode, blocks: Blocks) => {
	const slots = slotsOf(block, blocks);
	return block.type === "Columns"
		? slots.slice(0, Number(block.props["count"]) || slots.length)
		: slots;
};

/** Every block on the canvas in reading order: depth first, each block before the blocks in its slots. */
export function readingOrder(
	content: readonly BlockNode[],
	blocks: Blocks = BLOCKS,
	zone: string = ROOT_ZONE,
): Selector[] {
	return content.flatMap((block, index) => [
		{ zone, index },
		...shownSlots(block, blocks).flatMap((slot) =>
			readingOrder(
				childrenIn(block, slot),
				blocks,
				`${block.props.id}:${slot}`,
			),
		),
	]);
}

/**
 * The block before or after the selected one in reading order. With nothing selected, ↓ starts at the first block
 * and ↑ at the last; `null` past either end.
 */
export function stepInReadingOrder(
	content: readonly BlockNode[],
	selected: Selector | null,
	step: -1 | 1,
	blocks: Blocks = BLOCKS,
): Selector | null {
	const order = readingOrder(content, blocks);
	const at = selected
		? order.findIndex(
				({ zone, index }) => zone === selected.zone && index === selected.index,
			)
		: -1;
	const target = at === -1 ? (step === 1 ? 0 : order.length - 1) : at + step;
	return order[target] ?? null;
}

/** The block whose slot holds the block at `selected`; `null` at the top level. */
export function parentSelector(
	content: readonly BlockNode[],
	selected: Selector,
	blocks: Blocks = BLOCKS,
): Selector | null {
	if (selected.zone === ROOT_ZONE) return null;
	return (
		selectorFor(content, splitZone(selected.zone).parentId, blocks) ?? null
	);
}

export type DrawerTile = {
	type: string;
	label: string;
	description: string;
	/** The feature the plan lacks; the tile is then locked and can't be added or dragged. */
	lockedBy?: Feature;
};

const DRAWER_GROUPS: readonly { group: BlockGroup; title: string }[] = [
	{ group: "ready", title: "Ready-made" },
	{ group: "content", title: "Content" },
	{ group: "layout", title: "Layout" },
];

/** The block drawer's groups in order, each with its blocks in manifest order. */
export const drawerGroups = (
	features: readonly Feature[],
	blocks: Blocks = BLOCKS,
) =>
	DRAWER_GROUPS.map(({ group, title }) => ({
		group,
		title,
		tiles: Object.entries(blocks)
			.filter(([, block]) => block.group === group)
			.map(
				([type, { label, description, requires }]): DrawerTile => ({
					type,
					label,
					description,
					...(requires && !features.includes(requires)
						? { lockedBy: requires }
						: {}),
				}),
			),
	}));
