import { BLOCKS, type BlockNode, type Blocks, ownEntry } from "@sinwy/shared";

export const ROOT_ZONE = "root:default-zone";

export type Selector = { zone: string; index: number };

const newBlockId = (type: string) => `${type}-${crypto.randomUUID()}`;

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

/** The blocks of a zone, `root:default-zone` or `<parent id>:<slot>`. */
export function zoneContent(
	content: readonly BlockNode[],
	zone: string,
	blocks: Blocks = BLOCKS,
): readonly BlockNode[] | undefined {
	if (zone === ROOT_ZONE) return content;
	const split = zone.lastIndexOf(":");
	const parentId = zone.slice(0, split);
	const slot = zone.slice(split + 1);
	const find = (list: readonly BlockNode[]): BlockNode | undefined => {
		for (const block of list) {
			if (block.props.id === parentId) return block;
			for (const name of slotsOf(block, blocks)) {
				const found = find(childrenIn(block, name));
				if (found) return found;
			}
		}
		return undefined;
	};
	const parent = find(content);
	return parent && slotsOf(parent, blocks).includes(slot)
		? childrenIn(parent, slot)
		: undefined;
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
