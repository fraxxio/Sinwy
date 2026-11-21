import { Puck, useGetPuck } from "@puckeditor/core";
import {
	LayersIcon,
	type LucideIcon,
	MonitorIcon,
	Redo2Icon,
	SmartphoneIcon,
	SquarePlusIcon,
	TabletIcon,
	Undo2Icon,
} from "lucide-react";
import {
	type ReactNode,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "#/shared/components/ui/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/shared/components/ui/tabs";
import { toast } from "#/shared/components/ui/toast";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/shared/components/ui/tooltip";
import { cn } from "#/shared/lib/utils";
import { BlockToolbar } from "./BlockChrome";
import { BlockDrawer } from "./BlockDrawer";
import { EditorCanvas } from "./EditorCanvas";
import { usePuck, VIEWPORTS } from "./editor-config";
import { PreloadRichText } from "./editor-fields";
import { hasUnsavedChanges, type PageData, type SaveResult } from "./save";
import {
	useBlockActions,
	useEditorHotkeys,
	useEditorKeys,
	useRefusedDropNotice,
} from "./use-block-actions";

const MOD =
	typeof navigator !== "undefined" &&
	/Mac|iPhone|iPad/.test(navigator.userAgent)
		? "⌘"
		: "Ctrl+";

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

function HistoryButtons() {
	const actions = useBlockActions();
	const hasPast = usePuck((s) => s.history.hasPast);
	const hasFuture = usePuck((s) => s.history.hasFuture);
	const buttons = [
		{
			label: "Undo",
			keys: `${MOD}Z`,
			icon: Undo2Icon,
			enabled: hasPast,
			run: actions.undo,
		},
		{
			label: "Redo",
			keys: `${MOD}Shift+Z`,
			icon: Redo2Icon,
			enabled: hasFuture,
			run: actions.redo,
		},
	];
	return (
		<div className="flex items-center gap-1">
			{buttons.map(({ label, keys, icon: Icon, enabled, run }) => (
				<Tooltip key={label}>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="sm"
								disabled={!enabled}
								onClick={run}
							/>
						}
					>
						<Icon aria-hidden />
						{label}
					</TooltipTrigger>
					<TooltipContent>{keys}</TooltipContent>
				</Tooltip>
			))}
		</div>
	);
}

/**
 * Undo and redo restore a whole app state, `ui` included; only the page should change. The user's `ui` goes back,
 * with their selection while its block exists. Puck remounts the fields, so no field keeps focus: a kept rich-text
 * focus makes the new editor record a duplicate entry that drops the redo history.
 */
function KeepUiOnHistory() {
	const getPuck = useGetPuck();
	const index = usePuck((s) => s.history.index);
	const ui = usePuck((s) => s.appState.ui);
	const selectedId = usePuck((s) => s.selectedItem?.props.id ?? null);
	const kept = useRef({ ui, selectedId });
	const lastIndex = useRef(index);
	useLayoutEffect(() => {
		const travelled = index !== lastIndex.current && ui !== kept.current.ui;
		lastIndex.current = index;
		if (!travelled) {
			kept.current = { ui, selectedId };
			return;
		}
		const { dispatch, getItemBySelector, getSelectorForId } = getPuck();
		const selection = kept.current.selectedId
			? getSelectorForId(kept.current.selectedId)
			: undefined;
		const restored = ui.itemSelector;
		dispatch({
			type: "setUi",
			ui: {
				...kept.current.ui,
				field: { focus: null },
				itemSelector: selection
					? { zone: selection.zone, index: selection.index }
					: restored && getItemBySelector(restored)
						? restored
						: null,
			},
		});
	}, [getPuck, index, ui, selectedId]);
	return null;
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
		if (saving) return;
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

	useEditorKeys((event) => {
		const mod = event.ctrlKey || event.metaKey;
		if (!mod || event.altKey || event.shiftKey || event.code !== "KeyS") return;
		event.preventDefault();
		if (dirty) save();
	});

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
		<aside
			aria-label="Blocks"
			className="flex w-72 shrink-0 flex-col border-r bg-card"
		>
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
		<aside
			aria-label="Block settings"
			className="flex w-80 shrink-0 flex-col border-l bg-card"
		>
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
	useEditorHotkeys();
	useRefusedDropNotice();
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
				<KeepUiOnHistory />
				<HistoryButtons />
				<SaveControls onSave={onSave} />
			</header>
			<div className="flex min-h-0 flex-1">
				<LeftPanel />
				<EditorCanvas />
				<RightPanel />
			</div>
			<PreloadRichText />
		</div>
	);
}
