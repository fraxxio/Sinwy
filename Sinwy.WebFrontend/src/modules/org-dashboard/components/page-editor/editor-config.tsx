import {
	type Config,
	createUsePuck,
	type Field,
	type PuckContext,
	type Viewports,
} from "@puckeditor/core";
import { BLOCKS, ROOT_ALLOW } from "@sinwy/shared";
import {
	BLOCK_RENDERS,
	PageFrame,
} from "#/shared/components/page-builder/blocks";
import { puckConfigFrom } from "#/shared/components/page-builder/puck-config";
import { FirstRunBlocks } from "./BlockDrawer";
import { ROOT_ZONE } from "./block-actions";
import { lockedField, serviceIdsField } from "./editor-fields";

export const usePuck = createUsePuck();

export const DESKTOP_WIDTH = 1280;

export const VIEWPORTS = [
	{ width: DESKTOP_WIDTH, height: "auto", label: "Desktop" },
	{ width: 768, height: "auto", label: "Tablet" },
	{ width: 375, height: "auto", label: "Phone" },
] satisfies Viewports;

function EditorPage({
	puck: { metadata, renderDropZone },
}: {
	puck: PuckContext;
}) {
	const isEmpty = usePuck((s) => s.appState.data.content.length === 0);
	return (
		<PageFrame metadata={metadata} className="min-h-svh content-start p-6">
			{isEmpty && <FirstRunBlocks />}
			{renderDropZone({
				zone: ROOT_ZONE,
				allow: [...ROOT_ALLOW],
				className:
					"grid content-start gap-8 empty:min-h-0! empty:bg-transparent! empty:outline-none! after:flex after:h-24 after:items-center after:justify-center after:rounded-xl after:border-2 after:border-muted-foreground/30 after:border-dashed after:text-muted-foreground after:text-sm after:content-['Drop_blocks_here']",
			})}
		</PageFrame>
	);
}

const withLockedFields = (config: Config): Config => ({
	...config,
	components: Object.fromEntries(
		Object.entries(config.components).map(([type, component]) => [
			type,
			{
				...component,
				fields: Object.fromEntries(
					Object.entries((component.fields ?? {}) as Record<string, Field>).map(
						([name, field]) => [
							name,
							field.metadata?.["locked"] ? lockedField(field) : field,
						],
					),
				),
			},
		]),
	),
});

/** Top-level drops are limited to what the server accepts there; Puck has no `root.allow`. */
export const editorConfig = withLockedFields(
	puckConfigFrom(BLOCKS, BLOCK_RENDERS, {
		customFields: { serviceIds: serviceIdsField },
		root: {
			render: ({ puck }: { puck: PuckContext }) => <EditorPage puck={puck} />,
		},
	}),
);
