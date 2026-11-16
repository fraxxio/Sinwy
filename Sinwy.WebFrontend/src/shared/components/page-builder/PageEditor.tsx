import { type Data, Puck, useGetPuck } from "@puckeditor/core";
import type { PuckDocument } from "@sinwy/shared";
import { type ReactNode, useState } from "react";
import { Button } from "#/shared/components/ui/button";
import { editorConfig } from "./editor-config";

const EMPTY: PuckDocument = { root: { props: {} }, content: [] };

type SaveResult = { ok: true } | { ok: false; message: string };

function SaveAction({
	onSave,
}: {
	onSave: (data: PuckDocument) => Promise<SaveResult>;
}) {
	const getPuck = useGetPuck();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const save = async () => {
		setSaving(true);
		setError(null);
		const result = await onSave(getPuck().appState.data as PuckDocument);
		setSaving(false);
		if (!result.ok) setError(result.message);
	};

	return (
		<>
			{error && (
				<span role="alert" className="text-destructive text-sm">
					{error}
				</span>
			)}
			<Button onClick={save} disabled={saving}>
				{saving ? "Saving…" : "Save"}
			</Button>
		</>
	);
}

export function PageEditor({
	initialData,
	title,
	path,
	actions,
	onSave,
}: {
	initialData: PuckDocument | null;
	title: string;
	path: string;
	actions?: ReactNode;
	onSave: (data: PuckDocument) => Promise<SaveResult>;
}) {
	return (
		<Puck
			config={editorConfig}
			data={(initialData ?? EMPTY) as Data}
			headerTitle={title}
			headerPath={path}
			height="100%"
			onAction={(action) => {
				const w = window as { __puckActions?: string[] };
				w.__puckActions = [...(w.__puckActions ?? []), action.type];
			}}
			overrides={{
				headerActions: () => (
					<>
						{actions}
						<SaveAction onSave={onSave} />
					</>
				),
			}}
		/>
	);
}
