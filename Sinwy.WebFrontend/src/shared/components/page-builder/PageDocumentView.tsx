import { Render } from "@puckeditor/core/rsc";
import {
	BLOCK_MIGRATIONS,
	BLOCKS,
	type BlockField,
	type BlockNode,
	isSlotField,
	migrateProps,
	ownEntry,
	PAGE_DOCUMENT_LIMITS,
	type PageManifest,
} from "@sinwy/shared";
import type { ReactNode } from "react";
import { BLOCK_RENDERS, PageFrame, type PageMetadata } from "./blocks";
import { puckConfigFrom } from "./puck-config";
import { RichText } from "./rich-text";

type Props = Record<string, unknown>;

const isObject = (value: unknown): value is Props =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const readValue = (
	field: Exclude<BlockField, { kind: "slot" }>,
	value: unknown,
) => {
	if (field.kind === "richText")
		return typeof value === "string" ? value : field.default;
	const parsed = field.schema.safeParse(value);
	return parsed.success ? parsed.data : field.default;
};

/**
 * A stored document's content as the renders expect it: migrated, every prop present and valid, unknown or malformed
 * blocks dropped. Stored rows aren't re-validated on read, so nothing here may throw.
 */
export const readPageContent = (
	document: unknown,
	{
		blocks = BLOCKS,
		migrations = BLOCK_MIGRATIONS,
	}: Partial<Omit<PageManifest, "rootAllow">> = {},
): BlockNode[] => {
	const ids = new Set<string>();
	const read = (list: unknown, depth: number): BlockNode[] => {
		if (!Array.isArray(list) || depth > PAGE_DOCUMENT_LIMITS.maxDepth)
			return [];
		return list.flatMap((node) => {
			if (!isObject(node) || typeof node["type"] !== "string") return [];
			const definition = ownEntry(blocks, node["type"]);
			const stored = node["props"];
			if (!definition || !isObject(stored)) return [];
			const { id } = stored;
			if (typeof id !== "string" || id === "" || ids.has(id)) return [];
			ids.add(id);
			const migrated = migrateProps(node["type"], stored, migrations);
			const props: BlockNode["props"] = { id };
			for (const [name, field] of Object.entries(definition.fields))
				props[name] = isSlotField(field)
					? read(migrated[name], depth + 1)
					: readValue(field, migrated[name]);
			return [{ type: node["type"], props }];
		});
	};
	const data = isObject(document) ? document["data"] : undefined;
	return read(isObject(data) ? data["content"] : undefined, 1);
};

/** Replaces Puck's lazy Tiptap renderer, which would ship editor code and render each block twice in the SSR stream. */
const FIELD_TRANSFORMS = {
	richtext: ({ value }: { value: unknown }) =>
		typeof value === "string" && value ? <RichText html={value} /> : null,
};

const config = puckConfigFrom(BLOCKS, BLOCK_RENDERS, {
	root: {
		render: ({
			children,
			puck,
		}: {
			children: ReactNode;
			puck: { metadata: Props };
		}) => <PageFrame metadata={puck.metadata}>{children}</PageFrame>,
	},
});

/** A stored page document rendered without editor code; `@puckeditor/core/rsc` is the only Puck import. */
export function PageDocumentView({
	document,
	metadata,
}: {
	document: unknown;
	metadata: PageMetadata;
}) {
	return (
		<Render
			config={config}
			data={{ root: { props: {} }, content: readPageContent(document) }}
			metadata={metadata}
			fieldTransforms={FIELD_TRANSFORMS}
		/>
	);
}
