import { z } from "zod";
import type { Feature } from "../plan";
import { hasOnlySafeLinks, isSafeHref, isSafeImageSrc } from "./PageUrls";

/** Every enum a page builder field offers; the editor's option lists and the server's schemas both read these. */
export const BLOCK_VALUES = {
	tone: ["plain", "muted", "brand"],
	padding: ["none", "small", "medium", "large"],
	align: ["start", "center"],
	width: ["narrow", "medium", "full"],
	columns: ["1", "2", "3", "4"],
	headingSize: ["1", "2", "3"],
	aspect: ["auto", "square", "wide"],
	buttonVariant: ["primary", "outline"],
	visibility: ["show", "hide"],
	radius: ["none", "small", "medium", "large"],
	spacing: ["compact", "comfortable", "spacious"],
} as const;

export type BlockValue<K extends keyof typeof BLOCK_VALUES> =
	(typeof BLOCK_VALUES)[K][number];

export const PUCK_LIMITS = {
	maxDepth: 6,
	maxComponents: 400,
	id: 64,
	shortText: 200,
	longText: 20_000,
	url: 2048,
	serviceIds: 50,
} as const;

/** A plain value, as saved before the prop became responsive, or one per breakpoint. */
const responsive = <T extends readonly [string, ...string[]]>(values: T) => {
	const value = z.enum(values);
	return z
		.union([
			value,
			z.strictObject({
				base: value,
				tablet: value.optional(),
				mobile: value.optional(),
			}),
		])
		.optional();
};

const text = (max: number = PUCK_LIMITS.shortText) => z.string().max(max);

const link = text(PUCK_LIMITS.url).refine(isSafeHref, "Unsafe link");
const image = text(PUCK_LIMITS.url).refine(isSafeImageSrc, "Unsafe image URL");

const cellMap = z.record(
	z.string().max(PUCK_LIMITS.id),
	z.strictObject({
		x: z.int().min(0).max(11),
		y: z.int().min(0).max(999),
		w: z.int().min(1).max(12),
		h: z.int().min(1).max(99),
	}),
);

const sectionProps = z.strictObject({
	tone: z.enum(BLOCK_VALUES.tone).optional(),
	padding: responsive(BLOCK_VALUES.padding),
});

export type BlockSpec = {
	/** Props besides `id`, the slots and `visibility`. */
	props: z.ZodObject;
	slots: readonly string[];
	/** Adding a new block of this type needs the feature; ones already on the page stay. */
	requires?: Feature;
};

export const BLOCKS = {
	Section: { props: sectionProps, slots: ["items"] },
	ServicesSection: { props: sectionProps, slots: ["items"] },
	Hero: {
		props: z.strictObject({
			image: image.optional(),
			align: responsive(BLOCK_VALUES.align),
		}),
		slots: ["items"],
	},
	Columns: {
		props: z.strictObject({ count: responsive(BLOCK_VALUES.columns) }),
		slots: ["column1", "column2", "column3", "column4"],
	},
	Container: {
		props: z.strictObject({
			width: responsive(BLOCK_VALUES.width),
			align: responsive(BLOCK_VALUES.align),
		}),
		slots: ["items"],
	},
	Heading: {
		props: z.strictObject({
			text: text().optional(),
			size: z.enum(BLOCK_VALUES.headingSize).optional(),
			align: responsive(BLOCK_VALUES.align),
		}),
		slots: [],
	},
	RichText: {
		props: z.strictObject({
			content: text(PUCK_LIMITS.longText)
				.refine(hasOnlySafeLinks, "Unsafe link in text")
				.optional(),
		}),
		slots: [],
	},
	Image: {
		props: z.strictObject({
			src: image.optional(),
			alt: text().optional(),
			aspect: z.enum(BLOCK_VALUES.aspect).optional(),
		}),
		slots: [],
	},
	Button: {
		props: z.strictObject({
			label: text().optional(),
			href: link.optional(),
			variant: z.enum(BLOCK_VALUES.buttonVariant).optional(),
			align: responsive(BLOCK_VALUES.align),
		}),
		slots: [],
	},
	BookingWidget: {
		props: z.strictObject({
			title: text().optional(),
			serviceIds: z
				.array(z.string().max(PUCK_LIMITS.id))
				.max(PUCK_LIMITS.serviceIds)
				.optional(),
		}),
		slots: [],
		requires: "advanced-widgets",
	},
	FreeGrid: {
		props: z.strictObject({
			layout: z
				.strictObject({
					desktop: cellMap,
					tablet: cellMap.optional(),
					mobile: cellMap.optional(),
				})
				.optional(),
		}),
		slots: ["items"],
	},
} satisfies Record<string, BlockSpec>;

export type BlockType = keyof typeof BLOCKS;

const BLOCK_SPECS: Record<string, BlockSpec | undefined> = BLOCKS;

export const ROOT_PROPS = z.strictObject({
	radius: z.enum(BLOCK_VALUES.radius).optional(),
	spacing: z.enum(BLOCK_VALUES.spacing).optional(),
});

const visibility = responsive(BLOCK_VALUES.visibility);

type Props = Record<string, unknown>;

/**
 * Renames and reshapes of stored props, keyed by block type. Each must be idempotent: the editor and the storefront
 * apply them on read (Puck `transformProps`), and the server on save.
 */
export const BLOCK_MIGRATIONS: Partial<
	Record<BlockType, (props: Props) => Props>
> = {
	Heading: ({ level, ...props }) =>
		level === undefined ? props : { ...props, size: props["size"] ?? level },
};

type Node = { type: string; props: Props };

const isObject = (value: unknown): value is Props =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Applies `BLOCK_MIGRATIONS` through the tree, slots included; anything that isn't a block, or is too deep to be accepted, is left alone. */
export const migrateBlocks = (content: unknown, depth = 1): unknown =>
	Array.isArray(content) && depth <= PUCK_LIMITS.maxDepth
		? content.map((node) => {
				if (!isObject(node) || typeof node["type"] !== "string") return node;
				if (!isObject(node["props"])) return node;
				const spec = BLOCK_SPECS[node["type"]];
				const migrate = BLOCK_MIGRATIONS[node["type"] as BlockType];
				const props = migrate ? migrate(node["props"]) : { ...node["props"] };
				for (const slot of spec?.slots ?? [])
					if (slot in props)
						props[slot] = migrateBlocks(props[slot], depth + 1);
				return { ...node, props };
			})
		: content;

/** Every block in the tree, depth first, with its depth (top level is 1). Stops below `maxDepth`. */
export function eachBlock(
	content: readonly Node[],
	visit: (node: Node, depth: number) => void,
	depth = 1,
) {
	for (const node of content) {
		visit(node, depth);
		if (depth >= PUCK_LIMITS.maxDepth) continue;
		for (const slot of BLOCK_SPECS[node.type]?.slots ?? []) {
			const children = node.props[slot];
			if (Array.isArray(children)) eachBlock(children, visit, depth + 1);
		}
	}
}

const nodeSchema = z.strictObject({
	type: z.string().min(1).max(PUCK_LIMITS.id),
	props: z.looseObject({ id: z.string().min(1).max(PUCK_LIMITS.id) }),
	readOnly: z.record(z.string(), z.boolean()).optional(),
});

/** Known types, each block's props, unique ids, size, depth and URLs. Walks the slots itself, so no schema recurses. */
export function checkBlocks(content: readonly unknown[], ctx: z.RefinementCtx) {
	const ids = new Set<string>();
	let count = 0;
	const report = (path: PropertyKey[], message: string) =>
		ctx.addIssue({ code: "custom", path, message });

	const walk = (
		list: readonly unknown[],
		path: PropertyKey[],
		depth: number,
	) => {
		if (depth > PUCK_LIMITS.maxDepth) {
			if (list.length > 0)
				report(path, `Blocks nest at most ${PUCK_LIMITS.maxDepth} levels deep`);
			return;
		}
		list.forEach((raw, index) => {
			const at = [...path, index];
			if (++count > PUCK_LIMITS.maxComponents) return;
			const node = nodeSchema.safeParse(raw);
			if (!node.success) {
				for (const issue of node.error.issues)
					report([...at, ...issue.path], issue.message);
				return;
			}
			const { type, props } = node.data;
			const spec = BLOCK_SPECS[type];
			if (!spec) {
				report([...at, "type"], `Unknown block type "${type}"`);
				return;
			}
			if (ids.has(props.id))
				report([...at, "props", "id"], `Block id "${props.id}" is used twice`);
			ids.add(props.id);

			const { id: _id, visibility: shown, ...rest } = props;
			const fields: Props = {};
			for (const [name, value] of Object.entries(rest)) {
				if (!spec.slots.includes(name)) {
					fields[name] = value;
					continue;
				}
				if (!Array.isArray(value)) {
					report([...at, "props", name], "A slot holds a list of blocks");
					continue;
				}
				walk(value, [...at, "props", name], depth + 1);
			}
			for (const issue of [
				...(spec.props.safeParse(fields).error?.issues ?? []),
				...(visibility.safeParse(shown).error?.issues.map((issue) => ({
					...issue,
					path: ["visibility", ...issue.path],
				})) ?? []),
			])
				report([...at, "props", ...issue.path], issue.message);
		});
	};

	walk(content, [], 1);
	if (count > PUCK_LIMITS.maxComponents)
		report([], `A page holds at most ${PUCK_LIMITS.maxComponents} blocks`);
}

/** Gated block types in a document, with the feature each needs. */
export const gatedBlocksIn = (content: readonly Node[]) => {
	const gated = new Map<string, Feature>();
	eachBlock(content, ({ type }) => {
		const requires = BLOCK_SPECS[type]?.requires;
		if (requires) gated.set(type, requires);
	});
	return gated;
};

/** Blocks in a document, counting those nested in slots. */
export const countBlocks = (content: readonly Node[]) => {
	let count = 0;
	eachBlock(content, () => count++);
	return count;
};
