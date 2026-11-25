import {
	type Data,
	type Overrides,
	Puck,
	type UiState,
} from "@puckeditor/core";
import type { ReactNode } from "react";
import type { PageMetadata } from "#/shared/components/page-builder/blocks";
import type { Autosave } from "./autosave";
import { chromeOverrides } from "./BlockChrome";
import { BlockAccessProvider } from "./BlockDrawer";
import { canvasOverrides } from "./EditorCanvas";
import { EditorLayout } from "./EditorLayout";
import { DESKTOP_WIDTH, editorConfig, VIEWPORTS } from "./editor-config";
import { EditorServicesContext, fieldOverrides } from "./editor-fields";
import { EditorUploadsContext } from "./image-field";
import type { Publishing } from "./PublishControls";
import type { ConflictActions } from "./SaveControls";
import type { PageData } from "./save";
import type { Uploads } from "./uploads";

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
	data,
	metadata,
	title,
	path,
	back,
	autosave,
	uploads,
	conflict,
	publishing,
}: {
	data: PageData;
	metadata: PageMetadata;
	title: string;
	path: string;
	back: ReactNode;
	autosave: Autosave;
	uploads: Uploads;
	conflict: ConflictActions;
	publishing: Publishing;
}) {
	return (
		<EditorServicesContext value={metadata.services}>
			<EditorUploadsContext value={uploads}>
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
							uploads={uploads}
							conflict={conflict}
							publishing={publishing}
						/>
					</Puck>
				</BlockAccessProvider>
			</EditorUploadsContext>
		</EditorServicesContext>
	);
}
