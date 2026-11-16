import type { Data } from "@puckeditor/core";
import { Render } from "@puckeditor/core/rsc";
import type { PuckDocument } from "@sinwy/shared";
import { type BuilderComponents, renderConfig } from "./render-config";
import { renderRichText } from "./rich-text";
import type { BuilderMetadata, ThemeTokens } from "./theme-tokens";

/** Replaces Puck's lazy Tiptap renderer, which hydrates with about 117 KB gzip of editor code and sends each block twice in the SSR stream. */
const RICH_TEXT_TRANSFORM = {
	richtext: ({ value }: { value: unknown }) => renderRichText(value),
};

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
			data={data as Data<BuilderComponents, Partial<ThemeTokens>>}
			metadata={metadata}
			fieldTransforms={RICH_TEXT_TRANSFORM}
		/>
	);
}
