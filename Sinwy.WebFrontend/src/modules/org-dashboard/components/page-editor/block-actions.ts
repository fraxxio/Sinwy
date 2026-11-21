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
