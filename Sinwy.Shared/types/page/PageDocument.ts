import { z } from "zod";
import type { Feature } from "../plan";
import {
	BLOCK_MIGRATIONS,
	BLOCKS,
	type BlockMigration,
	type BlockNode,
	type Blocks,
	isSlotField,
	ownEntry,
	PAGE_DOCUMENT_LIMITS,
	ROOT_ALLOW,
} from "./blocks";
import { linkTarget } from "./PageUrls";

/** What a page document is checked and migrated against; tests pass their own. */
export type PageManifest = {
	blocks: Blocks;
	/** Block types a page accepts at the top level. */
	rootAllow: readonly string[];
	migrations: Partial<Record<string, readonly BlockMigration[]>>;
};

const DEFAULT_MANIFEST: PageManifest = {
	blocks: BLOCKS,
	rootAllow: ROOT_ALLOW,
	migrations: BLOCK_MIGRATIONS,
};

type Props = Record<string, unknown>;

const isObject = (value: unknown): value is Props =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isBlockLike = (value: unknown): value is { type: string; props: Props } =>
	isObject(value) &&
	typeof value["type"] === "string" &&
	isObject(value["props"]);

/** A block's props after its type's migrations. */
export const migrateProps = (
	type: string,
	props: Props,
	migrations: PageManifest["migrations"] = BLOCK_MIGRATIONS,
) =>
	(ownEntry(migrations, type) ?? []).reduce(
		(current, migrate) => migrate(current),
		props,
	);

const migrateContent = (
	content: unknown,
	manifest: PageManifest,
	depth: number,
): unknown =>
	Array.isArray(content) && depth <= PAGE_DOCUMENT_LIMITS.maxDepth
		? content.map((node) => {
				if (!isBlockLike(node)) return node;
				const props = {
					...migrateProps(node.type, node.props, manifest.migrations),
				};
				for (const slot of ownEntry(manifest.blocks, node.type)?.slots ?? [])
					if (slot in props)
						props[slot] = migrateContent(props[slot], manifest, depth + 1);
				return { ...node, props };
			})
		: content;

/** Applies the block migrations through every slot. Anything that isn't a block, or is nested too deep, is left alone. */
export const migrateDocument = (
	document: unknown,
	manifest: Partial<PageManifest> = {},
): unknown => {
	if (!isObject(document) || !isObject(document["data"])) return document;
	const data = document["data"];
	return {
		...document,
		data: {
			...data,
			content: migrateContent(
				data["content"],
				{ ...DEFAULT_MANIFEST, ...manifest },
				1,
			),
		},
	};
};

const LIMITS = PAGE_DOCUMENT_LIMITS;

type Parent = {
	type: string;
	path: string;
	slot: string;
	allow: readonly string[];
};

/**
 * Checks every block through the slots and returns the content with each block's props parsed, so rich text comes
 * back normalised. Walks the tree itself, so no schema recurses.
 */
function checkContent(
	content: readonly unknown[],
	{ blocks, rootAllow }: PageManifest,
	report: (message: string) => void,
): BlockNode[] {
	const ids = new Set<string>();
	let count = 0;
	let stopped = false;
	const stop = (message: string) => {
		report(message);
		stopped = true;
	};

	const walk = (
		list: readonly unknown[],
		parent: Parent | null,
		depth: number,
	): BlockNode[] => {
		const out: BlockNode[] = [];
		for (const [index, raw] of list.entries()) {
			if (stopped) break;
			if (++count > LIMITS.maxBlocks) {
				stop(`A page holds at most ${LIMITS.maxBlocks} blocks`);
				break;
			}
			const position = parent
				? `${parent.path} › ${parent.slot} › ${index + 1}`
				: `position ${index + 1}`;
			if (!isBlockLike(raw)) {
				report(`The item at ${position} is not a block`);
				continue;
			}
			const { type, props } = raw;
			const definition = ownEntry(blocks, type);
			if (!definition) {
				report(
					`Unknown block type "${type.slice(0, LIMITS.id)}" at ${position}`,
				);
				continue;
			}
			const path = parent
				? `${parent.path} › ${parent.slot} › ${type} ${index + 1}`
				: `${type} ${index + 1}`;
			const where = parent ? `${type} at ${position}` : path;

			if (!(parent?.allow ?? rootAllow).includes(type))
				report(
					parent
						? `${type} can't go inside ${parent.type} (${where})`
						: `${type} can't go at the top level of a page (${where})`,
				);

			const { id, ...rest } = props;
			if (typeof id !== "string" || id === "" || id.includes("\0"))
				report(`${where}: needs an id`);
			else if (id.length > LIMITS.id)
				report(`${where}: id is longer than ${LIMITS.id} characters`);
			else if (ids.has(id)) report(`${where}: id "${id}" is used twice`);
			else ids.add(id);

			const values: [string, unknown][] = [];
			const slots: Record<string, BlockNode[]> = {};
			for (const [name, value] of Object.entries(rest)) {
				if (!definition.slots.includes(name)) {
					values.push([name, value]);
					continue;
				}
				if (!Array.isArray(value)) {
					report(`${where}: "${name}" must be a list of blocks`);
					continue;
				}
				if (value.length > 0 && depth >= LIMITS.maxDepth) {
					stop(`${where}: blocks nest at most ${LIMITS.maxDepth} levels deep`);
					break;
				}
				const slot = definition.fields[name];
				slots[name] = walk(
					value,
					{
						type,
						path,
						slot: name,
						allow: slot && isSlotField(slot) ? slot.allow : [],
					},
					depth + 1,
				);
			}

			const parsed = definition.schema.safeParse(Object.fromEntries(values));
			if (parsed.success) {
				out.push({
					type,
					props: { id: id as string, ...parsed.data, ...slots },
				});
				continue;
			}
			for (const issue of parsed.error.issues)
				report(
					issue.code === "unrecognized_keys"
						? `${where}: unknown field "${issue.keys[0]?.slice(0, LIMITS.id)}"`
						: `${where}: "${String(issue.path[0])}" ${issue.message}`,
				);
		}
		return out;
	};

	return walk(content, null, 1);
}

const rootSchema = z.object(
	{
		props: z
			.strictObject(
				{},
				{
					error: (issue) =>
						issue.code === "unrecognized_keys"
							? `Page settings have an unknown field "${issue.keys[0]?.slice(0, LIMITS.id)}"`
							: "Page settings must be an object",
				},
			)
			.default({}),
	},
	"Page settings are missing",
);

/**
 * A stored page: Puck's `Data` (`root` and `content`) in an envelope. Parsing migrates the blocks, checks them and
 * normalises their rich text.
 */
export const createPageDocumentSchema = (
	manifest: Partial<PageManifest> = {},
) => {
	const full = { ...DEFAULT_MANIFEST, ...manifest };
	return z.preprocess(
		(value) => migrateDocument(value, full),
		z.object(
			{
				schemaVersion: z.literal(2, "Unsupported page document version"),
				data: z
					.object(
						{
							root: rootSchema,
							content: z
								.array(z.unknown(), "Page content must be a list of blocks")
								.transform((content, ctx) => {
									let failed = false;
									const checked = checkContent(content, full, (message) => {
										failed = true;
										ctx.addIssue({ code: "custom", message });
									});
									return failed ? z.NEVER : checked;
								}),
							zones: z
								.record(z.string(), z.unknown(), "Drop zones are not supported")
								.refine(
									(zones) => Object.keys(zones).length === 0,
									"Drop zones are not supported",
								)
								.optional(),
						},
						"Page data is missing",
					)
					.transform(({ root, content }) => ({ root, content })),
			},
			"A page document must be an object",
		),
	);
};

export const pageDocumentSchema = createPageDocumentSchema();

export type PageDocument = z.output<typeof pageDocumentSchema>;

export const emptyPageDocument = (): PageDocument => ({
	schemaVersion: 2,
	data: { root: { props: {} }, content: [] },
});

/** The block types in a document and how many blocks it holds, through every slot, hidden Columns ones included. */
export const blocksIn = (
	document: { data: { content: readonly unknown[] } },
	blocks: Blocks = BLOCKS,
) => {
	const types = new Set<string>();
	let count = 0;
	const walk = (list: unknown, depth: number) => {
		if (!Array.isArray(list) || depth > LIMITS.maxDepth) return;
		for (const node of list) {
			if (!isBlockLike(node)) continue;
			types.add(node.type);
			count++;
			for (const slot of ownEntry(blocks, node.type)?.slots ?? [])
				walk(node.props[slot], depth + 1);
		}
	};
	walk(document.data.content, 1);
	return { types, count };
};

type DocumentLike = { data: { content: readonly unknown[] } };

/** Gated block types `next` adds that `features` don't cover; a type `latest` already has stays allowed, so downgraded pages can still be saved. */
export const lockedBlocksIn = (
	latest: DocumentLike,
	next: DocumentLike,
	features: readonly Feature[],
	blocks: Blocks = BLOCKS,
): string[] => {
	const kept = blocksIn(latest, blocks).types;
	return [...blocksIn(next, blocks).types].filter((type) => {
		const required = ownEntry(blocks, type)?.requires;
		return (
			required !== undefined && !features.includes(required) && !kept.has(type)
		);
	});
};

const linkFieldsOf = (blocks: Blocks, type: string) =>
	Object.entries(ownEntry(blocks, type)?.fields ?? {})
		.filter(([, f]) => f.kind === "link")
		.map(([name]) => name);

const linkedPageId = (value: unknown) => {
	if (typeof value !== "string") return null;
	const target = linkTarget(value);
	return target.kind === "page" ? target.pageId : null;
};

/** The ids of the pages a document's links point to, through every slot. */
export const pageLinksIn = (
	document: DocumentLike,
	blocks: Blocks = BLOCKS,
) => {
	const ids = new Set<string>();
	const walk = (list: unknown, depth: number) => {
		if (!Array.isArray(list) || depth > LIMITS.maxDepth) return;
		for (const node of list) {
			if (!isBlockLike(node)) continue;
			for (const name of linkFieldsOf(blocks, node.type)) {
				const id = linkedPageId(node.props[name]);
				if (id) ids.add(id);
			}
			for (const slot of ownEntry(blocks, node.type)?.slots ?? [])
				walk(node.props[slot], depth + 1);
		}
	};
	walk(document.data.content, 1);
	return ids;
};

/** Each `page:<id>` link swapped for that page's slug from `addresses` (id → slug); a block linking to a page not in it is dropped. */
export const resolvePageLinks = (
	document: PageDocument,
	addresses: ReadonlyMap<string, string>,
	blocks: Blocks = BLOCKS,
): PageDocument => {
	const resolve = (list: readonly BlockNode[]): BlockNode[] =>
		list.flatMap((node) => {
			const props = { ...node.props };
			for (const name of linkFieldsOf(blocks, node.type)) {
				const id = linkedPageId(props[name]);
				if (!id) continue;
				const slug = addresses.get(id);
				if (slug === undefined) return [];
				props[name] = slug;
			}
			for (const slot of ownEntry(blocks, node.type)?.slots ?? []) {
				const children = props[slot];
				if (Array.isArray(children)) props[slot] = resolve(children);
			}
			return [{ ...node, props }];
		});
	return {
		...document,
		data: { ...document.data, content: resolve(document.data.content) },
	};
};
