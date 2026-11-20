import { type Data, Puck, type UiState } from "@puckeditor/core";
import type { ReactNode } from "react";
import type { PageMetadata } from "#/shared/components/page-builder/blocks";
import { EditorLayout } from "./EditorLayout";
import { DESKTOP_WIDTH, editorConfig, VIEWPORTS } from "./editor-config";
import type { PageData, SaveResult } from "./save";

/** Puck's canvas picks the starting viewport and ours isn't Puck's, so the editor opens on desktop here. */
const INITIAL_UI: Partial<UiState> = {
	viewports: {
		current: { width: DESKTOP_WIDTH, height: "auto" },
		controlsVisible: true,
		options: VIEWPORTS,
	},
};

export function PageEditor({
	data,
	metadata,
	title,
	path,
	back,
	onSave,
}: {
	data: PageData;
	metadata: PageMetadata;
	title: string;
	path: string;
	back: ReactNode;
	onSave: (data: PageData) => Promise<SaveResult>;
}) {
	return (
		<Puck
			config={editorConfig}
			data={data as Data}
			metadata={metadata}
			ui={INITIAL_UI}
			viewports={VIEWPORTS}
			height="100%"
		>
			<EditorLayout title={title} path={path} back={back} onSave={onSave} />
		</Puck>
	);
}
