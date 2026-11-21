import { Puck, useGetPuck } from "@puckeditor/core";
import {
	LayersIcon,
	type LucideIcon,
	MonitorIcon,
	SmartphoneIcon,
	SquarePlusIcon,
	TabletIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "#/shared/components/ui/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/shared/components/ui/tabs";
import { toast } from "#/shared/components/ui/toast";
import { cn } from "#/shared/lib/utils";
import { BlockToolbar } from "./BlockChrome";
import { BlockDrawer } from "./BlockDrawer";
import { EditorCanvas } from "./EditorCanvas";
import { usePuck, VIEWPORTS } from "./editor-config";
import { hasUnsavedChanges, type PageData, type SaveResult } from "./save";

const VIEWPORT_ICONS: Record<string, LucideIcon> = {
	Desktop: MonitorIcon,
	Tablet: TabletIcon,
	Phone: SmartphoneIcon,
};

function ViewportSwitch() {
	const getPuck = useGetPuck();
	const width = usePuck((s) => s.appState.ui.viewports.current.width);
	return (
		<fieldset className="flex items-center gap-1 rounded-full bg-muted p-1">
			<legend className="sr-only">Preview size</legend>
			{VIEWPORTS.map((viewport) => {
				const Icon = VIEWPORT_ICONS[viewport.label] ?? MonitorIcon;
				const selected = viewport.width === width;
				return (
					<Button
						key={viewport.label}
						type="button"
						size="sm"
						variant="ghost"
						aria-pressed={selected}
						title={`${viewport.label} preview, ${viewport.width}px wide`}
						className={cn(
							"rounded-full",
							selected && "bg-background text-foreground shadow-sm",
						)}
						onClick={() => {
							const { appState, dispatch } = getPuck();
							dispatch({
								type: "setUi",
								ui: {
									viewports: {
										...appState.ui.viewports,
										current: { width: viewport.width, height: "auto" },
									},
								},
							});
						}}
					>
						<Icon aria-hidden />
						{viewport.label}
					</Button>
				);
			})}
		</fieldset>
	);
}

function SaveControls({
	onSave,
}: {
	onSave: (data: PageData) => Promise<SaveResult>;
}) {
	const getPuck = useGetPuck();
	const data = usePuck((s) => s.appState.data) as PageData;
	const [saved, setSaved] = useState(data);
	const [saving, setSaving] = useState(false);
	const dirty = useMemo(() => hasUnsavedChanges(data, saved), [data, saved]);

	const save = async () => {
		const attempted = getPuck().appState.data as PageData;
		setSaving(true);
		const result = await onSave(attempted);
		setSaving(false);
		if (result.ok) {
			setSaved(attempted);
			toast.add({ type: "success", title: "Changes saved", timeout: 3_000 });
		} else
			toast.add({
				type: "error",
				title: "Not saved",
				description: result.message,
				timeout: 10_000,
			});
	};

	return (
		<>
			<span
				className="w-32 text-right text-muted-foreground text-xs"
				aria-live="polite"
			>
				{saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
			</span>
			<Button disabled={saving || !dirty} onClick={save}>
				Save
			</Button>
		</>
	);
}

function LeftPanel() {
	return (
		<aside className="flex w-72 shrink-0 flex-col border-r bg-card">
			<Tabs defaultValue="add" className="flex min-h-0 flex-1 flex-col gap-0">
				<div className="border-b p-2">
					<TabsList className="w-full">
						<TabsTrigger value="add">
							<SquarePlusIcon /> Add
						</TabsTrigger>
						<TabsTrigger value="layers">
							<LayersIcon /> Layers
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent value="add" className="min-h-0 overflow-y-auto p-3">
					<p className="mb-3 text-muted-foreground text-xs">
						Click Add to put a block after the one you selected, or drag it onto
						the page.
					</p>
					<BlockDrawer />
				</TabsContent>
				<TabsContent value="layers" className="min-h-0 overflow-y-auto p-3">
					<Puck.Outline />
				</TabsContent>
			</Tabs>
		</aside>
	);
}

function RightPanel() {
	const hasSelection = usePuck((s) => !!s.selectedItem);
	return (
		<aside className="flex w-80 shrink-0 flex-col border-l bg-card">
			{hasSelection ? (
				<>
					<BlockToolbar />
					<div className="min-h-0 flex-1 overflow-y-auto">
						<Puck.Fields />
					</div>
				</>
			) : (
				<p className="p-6 text-muted-foreground text-sm">
					Select a block on the page to change its settings.
				</p>
			)}
		</aside>
	);
}

export function EditorLayout({
	title,
	path,
	back,
	onSave,
}: {
	title: string;
	path: string;
	back: ReactNode;
	onSave: (data: PageData) => Promise<SaveResult>;
}) {
	return (
		<div className="flex h-svh flex-col bg-background">
			<header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3">
				{back}
				<div className="min-w-0">
					<h1 className="truncate font-heading font-semibold text-sm leading-tight">
						{title}
					</h1>
					<p className="truncate text-muted-foreground text-xs">{path}</p>
				</div>
				<div className="mx-auto">
					<ViewportSwitch />
				</div>
				<SaveControls onSave={onSave} />
			</header>
			<div className="flex min-h-0 flex-1">
				<LeftPanel />
				<EditorCanvas />
				<RightPanel />
			</div>
		</div>
	);
}
