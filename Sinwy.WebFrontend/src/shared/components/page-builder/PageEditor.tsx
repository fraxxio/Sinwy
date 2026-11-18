import {
	type Data,
	Puck,
	type UiState,
	type Viewports,
} from "@puckeditor/core";
import type { PuckDocument } from "@sinwy/shared";
import type { ReactNode } from "react";
import {
	chromeOverrides,
	EditorLayout,
	type SaveResult,
	VIEWPORTS,
} from "./EditorChrome";
import { fieldOverrides } from "./editor-fields";
import { migrateDocument } from "./PuckPage";
import type { BuilderConfig } from "./render-config";
import { BuilderServicesContext } from "./ServicePicker";
import type { BuilderMetadata } from "./theme-tokens";

const EMPTY: PuckDocument = { root: { props: {} }, content: [] };

const overrides = { ...fieldOverrides, ...chromeOverrides };

/** Puck's canvas picks the starting viewport, and the composed layout has no canvas, so it starts on desktop here. */
const ui: Partial<UiState> = {
	viewports: {
		current: { width: VIEWPORTS[0].width, height: "auto" },
		controlsVisible: true,
		options: VIEWPORTS as unknown as Viewports,
	},
};

export function PageEditor({
	config,
	initialData,
	title,
	path,
	back,
	metadata,
	onSave,
	onPublish,
}: {
	config: BuilderConfig;
	initialData: PuckDocument | null;
	title: string;
	path: string;
	back: ReactNode;
	metadata: BuilderMetadata;
	onSave: (data: PuckDocument) => Promise<SaveResult>;
	onPublish?: () => Promise<SaveResult>;
}) {
	return (
		<BuilderServicesContext value={metadata.services}>
			<Puck
				config={config}
				metadata={metadata}
				data={migrateDocument(initialData ?? EMPTY) as Data}
				height="100%"
				ui={ui}
				viewports={VIEWPORTS as unknown as Viewports}
				dnd={{ enableDragHandle: true }}
				onAction={(action) => {
					const w = window as {
						__puckActions?: string[];
						__puckLog?: unknown[];
					};
					w.__puckActions = [...(w.__puckActions ?? []), action.type];
					w.__puckLog = [
						...(w.__puckLog ?? []),
						{
							type: action.type,
							recordHistory: (action as { recordHistory?: boolean })
								.recordHistory,
							action,
						},
					];
				}}
				overrides={overrides}
			>
				<EditorLayout
					title={title}
					path={path}
					back={back}
					onSave={(data) => onSave(data as PuckDocument)}
					onPublish={onPublish}
				/>
			</Puck>
		</BuilderServicesContext>
	);
}
