import {
	ActionBar,
	type Data,
	Drawer,
	type Overrides,
	Puck,
	useGetPuck,
	walkTree,
} from "@puckeditor/core";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	ClipboardPasteIcon,
	CopyIcon,
	CopyPlusIcon,
	CornerLeftUpIcon,
	LayersIcon,
	LayoutTemplateIcon,
	LockIcon,
	type LucideIcon,
	MonitorIcon,
	PlusIcon,
	Redo2Icon,
	SmartphoneIcon,
	SquarePlusIcon,
	TabletIcon,
	Trash2Icon,
	Undo2Icon,
} from "lucide-react";
import {
	createContext,
	type ReactNode,
	use,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/shared/components/ui/alert-dialog";
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
	TooltipProvider,
	TooltipTrigger,
} from "#/shared/components/ui/tooltip";
import { cn } from "#/shared/lib/utils";
import { Segmented } from "./editor-fields";
import { usePuck } from "./ResponsiveField";
import { PAGE_TEMPLATES, type PageTemplate, templateData } from "./templates";
import { useBlockActions, useEditorHotkeys } from "./use-block-actions";

export type SaveResult = { ok: true } | { ok: false; message: string };

/** One per breakpoint in `responsive.ts`; responsive fields edit the value of the selected one. */
export const VIEWPORTS = [
	{ width: 1280, height: "auto", icon: "Monitor", label: "Desktop" },
	{ width: 768, height: "auto", icon: "Tablet", label: "Tablet" },
	{ width: 375, height: "auto", icon: "Smartphone", label: "Phone" },
] as const;

const VIEWPORT_ICONS: Record<string, LucideIcon> = {
	Monitor: MonitorIcon,
	Tablet: TabletIcon,
	Smartphone: SmartphoneIcon,
};

const isMac = () =>
	typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const shortcut = (keys: string) => keys.replace("Mod", isMac() ? "⌘" : "Ctrl");

function IconAction({
	label,
	keys,
	icon: Icon,
	onClick,
	disabled,
	pressed,
	variant = "ghost",
}: {
	label: string;
	keys?: string | undefined;
	icon: LucideIcon;
	onClick: () => void;
	disabled?: boolean;
	pressed?: boolean;
	variant?: "ghost" | "outline";
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						type="button"
						variant={variant}
						size="icon-sm"
						aria-label={label}
						aria-pressed={pressed}
						disabled={disabled}
						onClick={onClick}
						className={cn(pressed && "bg-muted text-foreground")}
					/>
				}
			>
				<Icon />
			</TooltipTrigger>
			<TooltipContent>
				{label}
				{keys && (
					<span className="ml-2 text-background/70">{shortcut(keys)}</span>
				)}
			</TooltipContent>
		</Tooltip>
	);
}

function ViewportSwitch() {
	const getPuck = useGetPuck();
	const width = usePuck((s) => s.appState.ui.viewports.current.width);
	return (
		<Segmented
			label="Preview size"
			options={VIEWPORTS.map((viewport) => {
				const Icon = VIEWPORT_ICONS[viewport.icon] ?? MonitorIcon;
				return {
					key: viewport.label,
					value: viewport.width,
					title: `${viewport.label} preview (${viewport.width}px)`,
					content: (
						<>
							<Icon aria-hidden className="size-4" />
							<span className="sr-only">{viewport.label}</span>
						</>
					),
				};
			})}
			selected={VIEWPORTS.findIndex((viewport) => viewport.width === width)}
			onSelect={(next) => {
				const { appState, dispatch } = getPuck();
				dispatch({
					type: "setUi",
					ui: {
						viewports: {
							...appState.ui.viewports,
							current: { width: next, height: "auto" },
						},
					},
				});
			}}
		/>
	);
}

function EditorHeader({
	title,
	path,
	back,
	onSave,
	onPublish,
}: {
	title: string;
	path: string;
	back: ReactNode;
	onSave: (data: Data) => Promise<SaveResult>;
	onPublish?: (() => Promise<SaveResult>) | undefined;
}) {
	const getPuck = useGetPuck();
	const historyIndex = usePuck((s) => s.history.index);
	const hasPast = usePuck((s) => s.history.hasPast);
	const hasFuture = usePuck((s) => s.history.hasFuture);
	const [savedIndex, setSavedIndex] = useState(historyIndex);
	const [busy, setBusy] = useState<"save" | "publish" | null>(null);
	const dirty = historyIndex !== savedIndex;

	const save = async () => {
		const { appState, history } = getPuck();
		const result = await onSave(appState.data);
		if (result.ok) setSavedIndex(history.index);
		return result;
	};

	const run = async (action: "save" | "publish") => {
		setBusy(action);
		let result =
			action === "save" || dirty ? await save() : { ok: true as const };
		if (result.ok && action === "publish" && onPublish)
			result = await onPublish();
		setBusy(null);
		toast.add(
			result.ok
				? {
						type: "success",
						title: action === "save" ? "Changes saved" : "Page published",
						timeout: 3_000,
					}
				: { type: "error", title: result.message, timeout: 6_000 },
		);
	};

	return (
		<header className="flex h-14 shrink-0 items-center gap-3 border-(--line-soft) border-b bg-card px-3">
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
			<div className="flex items-center gap-1">
				<IconAction
					label="Undo"
					keys="Mod+Z"
					icon={Undo2Icon}
					disabled={!hasPast}
					onClick={() => getPuck().history.back()}
				/>
				<IconAction
					label="Redo"
					keys="Mod+Shift+Z"
					icon={Redo2Icon}
					disabled={!hasFuture}
					onClick={() => getPuck().history.forward()}
				/>
			</div>
			<span
				className="w-28 text-right text-muted-foreground text-xs"
				aria-live="polite"
			>
				{busy === "save"
					? "Saving…"
					: busy === "publish"
						? "Publishing…"
						: dirty
							? "Unsaved changes"
							: "All changes saved"}
			</span>
			<Button
				variant="outline"
				disabled={!!busy || !dirty}
				onClick={() => run("save")}
			>
				Save
			</Button>
			{onPublish && (
				<Button disabled={!!busy} onClick={() => run("publish")}>
					Publish
				</Button>
			)}
		</header>
	);
}

/** Puck sizes its action bar against a zoom only its own canvas sets, so ours scales the bar back itself. */
const CanvasZoom = createContext(1);

/** Puck's own canvas (viewport sizing, auto-zoom) isn't exported, so the composed layout scales the preview itself. */
function EditorCanvas() {
	const getPuck = useGetPuck();
	const width = usePuck((s) => s.appState.ui.viewports.current.width);
	const ref = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState({ width: 0, height: 0 });

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry)
				setBox({
					width: entry.contentRect.width,
					height: entry.contentRect.height,
				});
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const frameWidth = typeof width === "number" ? width : box.width;
	const zoom =
		box.width && frameWidth ? Math.min(1, box.width / frameWidth) : 1;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: clicking the backdrop deselects, as in Puck's canvas; Escape does the same from the keyboard.
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above.
		<div
			className="relative min-w-0 flex-1 bg-muted/50 p-6"
			onClick={(event) => {
				if (event.target === event.currentTarget)
					getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
			}}
		>
			<div ref={ref} className="pointer-events-none size-full">
				<div
					className="pointer-events-auto mx-auto"
					style={{ width: frameWidth * zoom, height: box.height }}
				>
					<div
						className="overflow-hidden rounded-xl bg-background shadow-sm ring-1 ring-(--line-soft) [&_iframe]:block [&_iframe]:size-full"
						style={{
							width: frameWidth,
							height: box.height / zoom,
							transform: `scale(${zoom})`,
							transformOrigin: "top left",
						}}
					>
						<CanvasZoom value={zoom}>
							<Puck.Preview />
						</CanvasZoom>
					</div>
				</div>
			</div>
		</div>
	);
}

const DRAWER_GROUPS: { title: string; types: string[] }[] = [
	{ title: "Ready-made sections", types: ["Hero", "ServicesSection"] },
	{
		title: "Content",
		types: ["Heading", "RichText", "Image", "Button", "BookingWidget"],
	},
	{ title: "Layout", types: ["Section", "Columns", "Container", "FreeGrid"] },
];

const BLOCK_INFO: Record<string, { description: string; sketch: ReactNode }> = {
	Hero: {
		description: "Big headline with a photo",
		sketch: (
			<div className="grid h-full place-content-center gap-1 bg-muted-foreground/15 p-1">
				<div className="mx-auto h-1.5 w-10 rounded-full bg-foreground/50" />
				<div className="mx-auto h-1 w-7 rounded-full bg-foreground/25" />
				<div className="mx-auto mt-0.5 h-2 w-5 rounded-sm bg-primary/60" />
			</div>
		),
	},
	ServicesSection: {
		description: "Your services, ready to book",
		sketch: (
			<div className="grid h-full grid-cols-3 gap-1 p-1.5">
				{[0, 1, 2].map((i) => (
					<div key={i} className="rounded-sm bg-foreground/15" />
				))}
			</div>
		),
	},
	Heading: {
		description: "A title for a part of the page",
		sketch: (
			<div className="grid h-full content-center p-2">
				<div className="h-2 w-3/4 rounded-full bg-foreground/50" />
			</div>
		),
	},
	RichText: {
		description: "Paragraphs, lists and links",
		sketch: (
			<div className="grid h-full content-center gap-1 p-2">
				<div className="h-1 w-full rounded-full bg-foreground/25" />
				<div className="h-1 w-full rounded-full bg-foreground/25" />
				<div className="h-1 w-2/3 rounded-full bg-foreground/25" />
			</div>
		),
	},
	Image: {
		description: "A photo or picture",
		sketch: (
			<div className="h-full p-1.5">
				<div className="h-full rounded-sm bg-gradient-to-br from-foreground/10 to-foreground/30" />
			</div>
		),
	},
	Button: {
		description: "A link that stands out",
		sketch: (
			<div className="grid h-full place-content-center">
				<div className="h-3 w-10 rounded-sm bg-primary/60" />
			</div>
		),
	},
	BookingWidget: {
		description: "Let visitors book a time",
		sketch: (
			<div className="grid h-full grid-cols-4 content-center gap-0.5 p-2">
				{Array.from({ length: 8 }, (_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static sketch
						key={i}
						className={cn(
							"h-1.5 rounded-xs",
							i === 5 ? "bg-primary/60" : "bg-foreground/20",
						)}
					/>
				))}
			</div>
		),
	},
	Section: {
		description: "A full-width band to fill",
		sketch: (
			<div className="h-full p-1.5">
				<div className="h-full rounded-sm border border-foreground/30 border-dashed" />
			</div>
		),
	},
	Columns: {
		description: "Side-by-side columns",
		sketch: (
			<div className="grid h-full grid-cols-2 gap-1 p-1.5">
				<div className="rounded-sm border border-foreground/30 border-dashed" />
				<div className="rounded-sm border border-foreground/30 border-dashed" />
			</div>
		),
	},
	Container: {
		description: "A centred box for blocks",
		sketch: (
			<div className="h-full px-4 py-1.5">
				<div className="h-full rounded-sm border border-foreground/30 border-dashed" />
			</div>
		),
	},
	FreeGrid: {
		description: "Place blocks freely",
		sketch: (
			<div className="grid h-full grid-cols-4 grid-rows-2 gap-0.5 p-1.5">
				<div className="col-span-2 rounded-xs bg-foreground/20" />
				<div className="col-span-2 row-span-2 rounded-xs bg-foreground/30" />
				<div className="col-span-2 rounded-xs bg-foreground/15" />
			</div>
		),
	},
};

function BlockCard({ name, locked }: { name: string; locked?: boolean }) {
	const label = usePuck((s) => s.config.components[name]?.label ?? name);
	const { add } = useBlockActions();
	const info = BLOCK_INFO[name];
	const hideBackgroundCopy = (el: HTMLDivElement | null) => {
		const copy = el?.closest<HTMLElement>('[class*="Drawer-draggableBg"]');
		if (copy) copy.inert = true;
	};
	return (
		<div
			ref={hideBackgroundCopy}
			className={cn(
				"group relative grid gap-1.5 rounded-lg border border-(--line-soft) bg-card p-1.5 text-left shadow-xs transition-colors",
				locked ? "cursor-pointer" : "cursor-grab hover:border-ring/40",
			)}
		>
			<div
				className={cn(
					"aspect-[4/3] overflow-hidden rounded-md bg-muted",
					locked && "opacity-50",
				)}
			>
				{info?.sketch}
			</div>
			<div className="grid gap-0.5 px-0.5 pb-0.5">
				<span className="flex items-center gap-1 truncate font-medium text-xs">
					{locked && <LockIcon className="size-3 shrink-0" />}
					{label}
				</span>
				<span className="line-clamp-2 text-[11px] text-muted-foreground leading-tight">
					{locked ? "Upgrade to use" : info?.description}
				</span>
			</div>
			{!locked && (
				<button
					type="button"
					aria-label={`Add ${label}`}
					title={`Add ${label}`}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={() => add(name)}
					className="absolute top-2.5 right-2.5 grid size-6 place-content-center rounded-md bg-card/90 text-muted-foreground opacity-0 shadow-xs outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 group-hover:opacity-100"
				>
					<PlusIcon className="size-4" />
				</button>
			)}
		</div>
	);
}

const renderBlockCard = ({ name }: { name: string }) => (
	<BlockCard name={name} />
);

function BlockDrawer() {
	const getPuck = useGetPuck();
	const [upgrading, setUpgrading] = useState<string | null>(null);
	const { config } = getPuck();
	const available = new Set(
		Object.values(config.categories ?? {})
			.filter((category) => category.visible !== false)
			.flatMap((category) => category.components ?? []),
	);

	return (
		<div className="grid gap-4">
			{DRAWER_GROUPS.map((group) => (
				<section key={group.title} className="grid gap-2">
					<h3 className="font-medium text-muted-foreground text-xs">
						{group.title}
					</h3>
					<Drawer>
						<div className="isolate grid grid-cols-2 gap-2">
							{group.types
								.filter((type) => config.components[type])
								.map((type) =>
									available.has(type) ? (
										<Drawer.Item
											key={type}
											name={type}
											label={config.components[type]?.label ?? type}
										>
											{renderBlockCard}
										</Drawer.Item>
									) : (
										<button
											key={type}
											type="button"
											className="rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
											onClick={() => setUpgrading(type)}
										>
											<BlockCard name={type} locked />
										</button>
									),
								)}
						</div>
					</Drawer>
				</section>
			))}
			<AlertDialog
				open={!!upgrading}
				onOpenChange={(open) => !open && setUpgrading(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Upgrade to use this block</AlertDialogTitle>
						<AlertDialogDescription>
							{upgrading && config.components[upgrading]?.label} is part of a
							higher plan. Upgrade your plan to add it to your pages.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Not now</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => window.open("/account/billing", "_blank")}
						>
							See plans
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function TemplatePicker() {
	const getPuck = useGetPuck();
	const isEmpty = usePuck((s) => s.appState.data.content.length === 0);
	const [pending, setPending] = useState<PageTemplate | null>(null);

	const apply = (template: PageTemplate) => {
		const { config, dispatch } = getPuck();
		const data = templateData(config, template);
		dispatch({ type: "setData", data, recordHistory: true });
		dispatch({ type: "setUi", ui: { itemSelector: null } });
		const { resolveDataById } = getPuck();
		walkTree({ root: {}, ...data } as Data, config, (content) => {
			for (const block of content) resolveDataById(block.props.id, "insert");
		});
		setPending(null);
	};

	return (
		<div className="grid gap-2">
			<p className="text-muted-foreground text-xs">
				{isEmpty
					? "Start from a ready-made page and change the words and photos."
					: "Replaces everything on this page. You can undo it."}
			</p>
			{PAGE_TEMPLATES.map((template) => (
				<button
					key={template.id}
					type="button"
					onClick={() => (isEmpty ? apply(template) : setPending(template))}
					className="grid gap-1 rounded-lg border border-(--line-soft) bg-card p-3 text-left shadow-xs outline-none transition-colors hover:border-ring/40 focus-visible:ring-2 focus-visible:ring-ring/40"
				>
					<span className="font-medium text-sm">{template.name}</span>
					<span className="text-muted-foreground text-xs">
						{template.description}
					</span>
				</button>
			))}
			<AlertDialog
				open={!!pending}
				onOpenChange={(open) => !open && setPending(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Replace this page?</AlertDialogTitle>
						<AlertDialogDescription>
							Everything on the page is swapped for the “{pending?.name}”
							template. Undo brings it back.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => pending && apply(pending)}>
							Replace page
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function LeftPanel() {
	const [tab, setTab] = useState(() => "add");
	const isEmpty = usePuck((s) => s.appState.data.content.length === 0);
	const [opened, setOpened] = useState(false);

	useEffect(() => {
		if (!opened) {
			setOpened(true);
			if (isEmpty) setTab("templates");
		}
	}, [opened, isEmpty]);

	return (
		<aside className="flex w-72 shrink-0 flex-col border-(--line-soft) border-r bg-card">
			<Tabs
				value={tab}
				onValueChange={(value) => setTab(String(value))}
				className="flex min-h-0 flex-1 flex-col gap-0"
			>
				<div className="border-(--line-soft) border-b p-2">
					<TabsList className="w-full">
						<TabsTrigger value="add">
							<SquarePlusIcon /> Add
						</TabsTrigger>
						<TabsTrigger value="layers">
							<LayersIcon /> Layers
						</TabsTrigger>
						<TabsTrigger value="templates">
							<LayoutTemplateIcon /> Templates
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent
					value="add"
					className="pb-drawer min-h-0 overflow-y-auto p-3"
				>
					<p className="mb-2 text-muted-foreground text-xs">
						Drag a block onto the page, or press + to add it after the selected
						block.
					</p>
					<BlockDrawer />
				</TabsContent>
				<TabsContent value="layers" className="min-h-0 overflow-y-auto p-3">
					<Puck.Outline />
				</TabsContent>
				<TabsContent value="templates" className="min-h-0 overflow-y-auto p-3">
					<TemplatePicker />
				</TabsContent>
			</Tabs>
		</aside>
	);
}

function BlockToolbar() {
	const actions = useBlockActions();
	const getPuck = useGetPuck();
	const item = usePuck((s) => s.selectedItem);
	const selector = usePuck((s) => s.appState.ui.itemSelector);
	const selected = (() => {
		if (!item || !selector) return null;
		const puck = getPuck();
		const permissions = puck.getPermissions({ item });
		return {
			label: puck.config.components[item.type]?.label ?? item.type,
			first: selector.index === 0,
			last: !puck.getItemBySelector({
				zone: selector.zone ?? "",
				index: selector.index + 1,
			}),
			hasParent: !!puck.getParentById(item.props.id),
			drag: permissions.drag,
			duplicate: permissions.duplicate,
			delete: permissions.delete,
		};
	})();

	if (!selected)
		return (
			<div className="border-(--line-soft) border-b px-4 py-3">
				<h2 className="font-heading font-semibold text-sm">Page settings</h2>
				<p className="text-muted-foreground text-xs">
					Select a block on the page to edit it.
				</p>
			</div>
		);

	return (
		<div className="grid gap-2 border-(--line-soft) border-b px-4 py-3">
			<h2 className="font-heading font-semibold text-sm">{selected.label}</h2>
			<div className="flex flex-wrap items-center gap-0.5">
				<IconAction
					label="Select the block around this one"
					icon={CornerLeftUpIcon}
					disabled={!selected.hasParent}
					onClick={actions.selectParent}
				/>
				<IconAction
					label="Move up"
					keys="Alt+↑"
					icon={ArrowUpIcon}
					disabled={!selected.drag || selected.first}
					onClick={() => actions.move(-1)}
				/>
				<IconAction
					label="Move down"
					keys="Alt+↓"
					icon={ArrowDownIcon}
					disabled={!selected.drag || selected.last}
					onClick={() => actions.move(1)}
				/>
				<IconAction
					label="Duplicate"
					keys="Mod+D"
					icon={CopyPlusIcon}
					disabled={!selected.duplicate}
					onClick={actions.duplicate}
				/>
				<IconAction
					label="Copy"
					keys="Mod+C"
					icon={CopyIcon}
					onClick={actions.copy}
				/>
				<IconAction
					label="Paste after this block"
					keys="Mod+V"
					icon={ClipboardPasteIcon}
					onClick={actions.paste}
				/>
				<span className="ml-auto" />
				<IconAction
					label={selected.delete ? "Delete" : "This block can't be removed"}
					keys={selected.delete ? "Delete" : undefined}
					icon={Trash2Icon}
					disabled={!selected.delete}
					onClick={actions.remove}
				/>
			</div>
			{!selected.delete && (
				<p className="text-muted-foreground text-xs">
					Part of a ready-made section, so it stays. You can still change it.
				</p>
			)}
		</div>
	);
}

function RightPanel() {
	return (
		<aside className="pb-fields flex w-80 shrink-0 flex-col border-(--line-soft) border-l bg-card">
			<BlockToolbar />
			<div className="min-h-0 flex-1 overflow-y-auto">
				<Puck.Fields />
			</div>
		</aside>
	);
}

/** The canvas action bar, with our duplicate and delete (Puck's duplicate loses a FreeGrid's arrangement). */
function CanvasActionBar({
	label,
	parentAction,
	dragHandle,
}: {
	label?: string | undefined;
	parentAction: ReactNode;
	dragHandle?: ReactNode;
}) {
	const actions = useBlockActions();
	const getPuck = useGetPuck();
	const item = usePuck((s) => s.selectedItem);
	const permissions = item ? getPuck().getPermissions({ item }) : null;
	const zoom = use(CanvasZoom);
	return (
		<div
			className="flex"
			style={{
				transform: `scale(${1 / zoom})`,
				transformOrigin: "right bottom",
			}}
		>
			<ActionBar>
				<ActionBar.Group>
					{parentAction}
					{label && <ActionBar.Label label={label} />}
				</ActionBar.Group>
				{permissions && (permissions.duplicate || permissions.delete) && (
					<ActionBar.Group>
						{permissions.duplicate && (
							<ActionBar.Action label="Duplicate" onClick={actions.duplicate}>
								<CopyPlusIcon className="size-4" />
							</ActionBar.Action>
						)}
						{permissions.delete && (
							<ActionBar.Action label="Delete" onClick={actions.remove}>
								<Trash2Icon className="size-4" />
							</ActionBar.Action>
						)}
					</ActionBar.Group>
				)}
				{dragHandle && <ActionBar.Group>{dragHandle}</ActionBar.Group>}
			</ActionBar>
		</div>
	);
}

export const chromeOverrides: Partial<Overrides> = {
	actionBar: (props) => <CanvasActionBar {...props} />,
};

function useHistoryProbe() {
	const getPuck = useGetPuck();
	const length = usePuck((s) => s.history.histories.length);
	const index = usePuck((s) => s.history.index);
	useEffect(() => {
		const w = window as { __getPuck?: unknown; __puckLog?: unknown[] };
		w.__getPuck = getPuck;
		w.__puckLog = [...(w.__puckLog ?? []), { history: { length, index } }];
	}, [getPuck, length, index]);
}

/** Undo and redo restore a whole app state, `ui` included; put back the viewport the user is on. */
function useKeepViewportOnHistory() {
	const getPuck = useGetPuck();
	const index = usePuck((s) => s.history.index);
	const viewports = usePuck((s) => s.appState.ui.viewports);
	const kept = useRef(viewports);
	const lastIndex = useRef(index);
	useLayoutEffect(() => {
		if (index === lastIndex.current) {
			kept.current = viewports;
			return;
		}
		lastIndex.current = index;
		const { appState, dispatch, getItemBySelector } = getPuck();
		const { itemSelector } = appState.ui;
		const lostSelection = !!itemSelector && !getItemBySelector(itemSelector);
		const viewportMoved =
			viewports.current.width !== kept.current.current.width;
		if (lostSelection || viewportMoved)
			dispatch({
				type: "setUi",
				ui: {
					...(viewportMoved && { viewports: kept.current }),
					...(lostSelection && { itemSelector: null }),
				},
			});
	}, [getPuck, index, viewports]);
}

export function EditorLayout(props: {
	title: string;
	path: string;
	back: ReactNode;
	onSave: (data: Data) => Promise<SaveResult>;
	onPublish?: (() => Promise<SaveResult>) | undefined;
}) {
	useEditorHotkeys();
	useHistoryProbe();
	useKeepViewportOnHistory();
	return (
		<TooltipProvider delay={400}>
			<div className="pb-editor flex h-full flex-col bg-background">
				<EditorHeader {...props} />
				<div className="flex min-h-0 flex-1">
					<LeftPanel />
					<EditorCanvas />
					<RightPanel />
				</div>
			</div>
		</TooltipProvider>
	);
}
