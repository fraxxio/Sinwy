import {
	type Data,
	type Overrides,
	Puck,
	type UiState,
} from "@puckeditor/core";
import { type ReactNode, useMemo } from "react";
import { uploadPageImage } from "#/modules/org-dashboard/lib/page-queries";
import type { PageMetadata } from "#/shared/components/page-builder/blocks";
import type { Autosave } from "./autosave";
import { chromeOverrides } from "./BlockChrome";
import { BlockAccessProvider } from "./BlockDrawer";
import { canvasOverrides } from "./EditorCanvas";
import { EditorLayout } from "./EditorLayout";
import { DESKTOP_WIDTH, editorConfig, VIEWPORTS } from "./editor-config";
import { EditorServicesContext, fieldOverrides } from "./editor-fields";
import { EditorImageUploadContext, type UploadImage } from "./image-field";
import type { Publishing } from "./PublishControls";
import type { ConflictActions } from "./SaveControls";
import type { PageData } from "./save";

/** Puck's canvas picks the starting viewport and ours isn't Puck's, so the editor opens on desktop here. */
const INITIAL_UI: Partial<UiState> = {
	viewports: {
		current: { width: DESKTOP_WIDTH, height: "auto" },
		controlsVisible: true,
		options: VIEWPORTS,
	},
};

const OVERRIDES: Partial<Overrides> = {
	...fieldOverrides,
	...chromeOverrides,
	...canvasOverrides,
};

/** With the handle on, a selected Text block's body press goes to its inline editor and the handle moves it. */
const DND = { enableDragHandle: true };

export function PageEditor({
	organizationId,
	data,
	metadata,
	title,
	path,
	back,
	autosave,
	conflict,
	publishing,
}: {
	organizationId: string;
	data: PageData;
	metadata: PageMetadata;
	title: string;
	path: string;
	back: ReactNode;
	autosave: Autosave;
	conflict: ConflictActions;
	publishing: Publishing;
}) {
	const uploadImage = useMemo<UploadImage>(
		() => (image, signal) => uploadPageImage(organizationId, image, signal),
		[organizationId],
	);
	return (
		<EditorServicesContext value={metadata.services}>
			<EditorImageUploadContext value={uploadImage}>
				<BlockAccessProvider>
					<Puck
						config={editorConfig}
						data={data as Data}
						metadata={metadata}
						ui={INITIAL_UI}
						viewports={VIEWPORTS}
						overrides={OVERRIDES}
						dnd={DND}
						height="100%"
					>
						<EditorLayout
							title={title}
							path={path}
							back={back}
							autosave={autosave}
							conflict={conflict}
							publishing={publishing}
						/>
					</Puck>
				</BlockAccessProvider>
			</EditorImageUploadContext>
		</EditorServicesContext>
	);
}
