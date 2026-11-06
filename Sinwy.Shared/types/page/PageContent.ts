import { z } from "zod";
import type { Feature } from "../plan";

export type BlockDefinition = {
	label: string;
	/** Saving a new block of this type needs the feature; existing ones stay editable. */
	requires?: Feature;
};

const blockTypes = {
	heading: { label: "Heading" },
	text: { label: "Text" },
	image: { label: "Image" },
	button: { label: "Button" },
	gallery: { label: "Gallery", requires: "page-builder" },
	testimonials: { label: "Testimonials", requires: "page-builder" },
} satisfies Record<string, BlockDefinition>;

export type BlockType = keyof typeof blockTypes;

export const BLOCK_TYPES: Record<BlockType, BlockDefinition> = blockTypes;

const blockTypeNames = Object.keys(blockTypes) as [BlockType, ...BlockType[]];

export const PAGE_CONTENT_LIMITS = {
	maxDepth: 5,
	maxBlocks: 200,
	blockId: 64,
} as const;

/** Props belong to the page builder, so only their shape is checked here. */
export type PageBlock = {
	id: string;
	type: BlockType;
	props: Record<string, unknown>;
	children?: PageBlock[];
};

export type PageContent = {
	schemaVersion: 1;
	blocks: PageBlock[];
};

const blockList = (schema: z.ZodType<PageBlock>) =>
	z
		.array(schema)
		.max(
			PAGE_CONTENT_LIMITS.maxBlocks,
			`A page holds at most ${PAGE_CONTENT_LIMITS.maxBlocks} blocks`,
		);

// One schema per nesting level, so an over-deep tree is refused without recursing into it.
const blockAt = (depth: number): z.ZodType<PageBlock> =>
	z.object({
		id: z.string().min(1).max(PAGE_CONTENT_LIMITS.blockId),
		type: z.enum(blockTypeNames, "Unknown block type"),
		props: z.record(z.string(), z.unknown()),
		children:
			depth < PAGE_CONTENT_LIMITS.maxDepth
				? blockList(blockAt(depth + 1)).optional()
				: z
						.array(z.unknown())
						.max(
							0,
							`Blocks nest at most ${PAGE_CONTENT_LIMITS.maxDepth} levels deep`,
						)
						.optional(),
	}) as z.ZodType<PageBlock>;

const eachBlock = (blocks: PageBlock[], visit: (block: PageBlock) => void) => {
	for (const block of blocks) {
		visit(block);
		if (block.children) eachBlock(block.children, visit);
	}
};

/** Every block type a content tree uses, nested ones included. */
export const blockTypesIn = (content: PageContent): Set<BlockType> => {
	const types = new Set<BlockType>();
	eachBlock(content.blocks, (block) => types.add(block.type));
	return types;
};

export const pageContentSchema = z
	.object({
		schemaVersion: z.literal(1),
		blocks: blockList(blockAt(1)),
	})
	.superRefine((content, ctx) => {
		const ids = new Set<string>();
		let count = 0;
		eachBlock(content.blocks, (block) => {
			count++;
			if (ids.has(block.id))
				ctx.addIssue({
					code: "custom",
					path: ["blocks"],
					message: `Block id "${block.id}" is used twice`,
				});
			ids.add(block.id);
		});
		if (count > PAGE_CONTENT_LIMITS.maxBlocks)
			ctx.addIssue({
				code: "custom",
				path: ["blocks"],
				message: `A page holds at most ${PAGE_CONTENT_LIMITS.maxBlocks} blocks`,
			});
	}) satisfies z.ZodType<PageContent>;
