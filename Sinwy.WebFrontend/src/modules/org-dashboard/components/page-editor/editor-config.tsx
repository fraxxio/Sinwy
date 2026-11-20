import {
	createUsePuck,
	type PuckContext,
	type Viewports,
} from "@puckeditor/core";
import { BLOCKS, ROOT_ALLOW } from "@sinwy/shared";
import {
	BLOCK_RENDERS,
	PageFrame,
} from "#/shared/components/page-builder/blocks";
import { puckConfigFrom } from "#/shared/components/page-builder/puck-config";

export const usePuck = createUsePuck();

export const DESKTOP_WIDTH = 1280;

export const VIEWPORTS = [
	{ width: DESKTOP_WIDTH, height: "auto", label: "Desktop" },
	{ width: 768, height: "auto", label: "Tablet" },
	{ width: 375, height: "auto", label: "Phone" },
] satisfies Viewports;

const ROOT_ZONE = "root:default-zone";

function EditorPage({
	puck: { metadata, renderDropZone },
}: {
	puck: PuckContext;
}) {
	const isEmpty = usePuck((s) => s.appState.data.content.length === 0);
	return (
		<PageFrame metadata={metadata} className="min-h-svh content-start p-6">
			{isEmpty && (
				<div className="grid gap-1 pt-10 text-center">
					<p className="font-heading font-semibold text-lg">
						This page is empty
					</p>
					<p className="text-muted-foreground text-sm">
						Add your first block from the Add panel.
					</p>
				</div>
			)}
			{renderDropZone({
				zone: ROOT_ZONE,
				allow: [...ROOT_ALLOW],
				className:
					"grid content-start gap-8 empty:min-h-0! empty:bg-transparent! empty:outline-none! after:flex after:h-24 after:items-center after:justify-center after:rounded-xl after:border-2 after:border-muted-foreground/30 after:border-dashed after:text-muted-foreground after:text-sm after:content-['Drop_blocks_here']",
			})}
		</PageFrame>
	);
}

/** Top-level drops are limited to what the server accepts there; Puck has no `root.allow`. */
export const editorConfig = puckConfigFrom(BLOCKS, BLOCK_RENDERS, {
	root: {
		render: ({ puck }: { puck: PuckContext }) => <EditorPage puck={puck} />,
	},
});
