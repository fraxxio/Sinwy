import type { Data } from "@puckeditor/core";
import { Render, transformProps } from "@puckeditor/core/rsc";
import { BLOCK_MIGRATIONS, type PuckDocument } from "@sinwy/shared";
import {
	type BuilderComponents,
	type BuilderConfig,
	renderConfig,
} from "./render-config";
import { renderRichText } from "./rich-text";
import type { BuilderMetadata, ThemeTokens } from "./theme-tokens";

/** Replaces Puck's lazy Tiptap renderer, which hydrates with about 117 KB gzip of editor code and sends each block twice in the SSR stream. */
const RICH_TEXT_TRANSFORM = {
	richtext: ({ value }: { value: unknown }) => renderRichText(value),
};

/** A stored document in the current prop shape; the same migrations run on the server when it saves. */
export const migrateDocument = (data: PuckDocument) =>
	transformProps(
		data as Data,
		BLOCK_MIGRATIONS as never,
		renderConfig as BuilderConfig as never,
	) as Data<BuilderComponents, Partial<ThemeTokens>>;

/** The storefront side of the page builder: `Render` from the editor-free entry. */
export function PuckPage({
	data,
	metadata,
}: {
	data: PuckDocument;
	metadata: BuilderMetadata;
}) {
	return (
		<Render
			config={renderConfig}
			data={migrateDocument(data)}
			metadata={metadata}
			fieldTransforms={RICH_TEXT_TRANSFORM}
		/>
	);
}
