import { ActionBar, type Overrides } from "@puckeditor/core";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	CopyPlusIcon,
	CornerLeftUpIcon,
	Trash2Icon,
} from "lucide-react";
import {
	type ReactNode,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Button } from "#/shared/components/ui/button";
import { cn } from "#/shared/lib/utils";
import { ROOT_ZONE } from "./block-actions";
import { usePuck } from "./editor-config";
import { useBlockActions } from "./use-block-actions";

let canvasZoom = 1;
const zoomListeners = new Set<() => void>();

/**
 * How far the canvas scales the page down, so the chrome inside it can scale back up and stay readable. Puck renders
 * that chrome outside the preview's React tree, where a context from the canvas doesn't reach.
 */
export const setCanvasZoom = (zoom: number) => {
	if (zoom === canvasZoom) return;
	canvasZoom = zoom;
	for (const listener of zoomListeners) listener();
};

const subscribeToZoom = (listener: () => void) => {
	zoomListeners.add(listener);
	return () => zoomListeners.delete(listener);
};

const useCanvasZoom = () =>
	useSyncExternalStore(subscribeToZoom, () => canvasZoom);

export function BlockToolbar() {
	const actions = useBlockActions();
	const label = usePuck((s) =>
		s.selectedItem
			? (s.config.components[s.selectedItem.type]?.label ?? s.selectedItem.type)
			: null,
	);
	const first = usePuck((s) => s.appState.ui.itemSelector?.index === 0);
	const last = usePuck((s) => {
		const selector = s.appState.ui.itemSelector;
		return (
			!selector?.zone ||
			!s.getItemBySelector({ zone: selector.zone, index: selector.index + 1 })
		);
	});
	const hasParent = usePuck((s) => {
		const zone = s.appState.ui.itemSelector?.zone;
		return !!zone && zone !== ROOT_ZONE;
	});
	if (label === null) return null;

	return (
		<div className="grid gap-3 border-(--line-soft) border-b p-4">
			<div className="flex items-center justify-between gap-2">
				<h2 className="truncate font-heading font-semibold text-sm">{label}</h2>
				{hasParent && (
					<Button variant="ghost" size="xs" onClick={actions.selectParent}>
						<CornerLeftUpIcon aria-hidden />
						Select parent block
					</Button>
				)}
			</div>
			<div className="grid grid-cols-2 gap-1.5">
				<Button
					variant="outline"
					size="sm"
					disabled={first}
					onClick={() => actions.move(-1)}
				>
					<ArrowUpIcon aria-hidden />
					Move up
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={last}
					onClick={() => actions.move(1)}
				>
					<ArrowDownIcon aria-hidden />
					Move down
				</Button>
				<Button variant="outline" size="sm" onClick={actions.duplicate}>
					<CopyPlusIcon aria-hidden />
					Duplicate
				</Button>
				<Button variant="destructive" size="sm" onClick={actions.remove}>
					<Trash2Icon aria-hidden />
					Delete
				</Button>
			</div>
		</div>
	);
}

/** Puck clips the bar at the top of the canvas, so the bar moves itself down by as much as it would be cut off. */
function useUnclippedShift() {
	const ref = useRef<HTMLDivElement>(null);
	const [shift, setShift] = useState(0);
	useLayoutEffect(() => {
		const element = ref.current;
		const win = element?.ownerDocument.defaultView;
		if (!element || !win) return;
		let current = 0;
		const update = () => {
			const top = element.getBoundingClientRect().top - current;
			current = Math.max(0, -top);
			setShift(current);
		};
		update();
		win.addEventListener("scroll", update);
		return () => win.removeEventListener("scroll", update);
	}, []);
	return [ref, shift] as const;
}

function BlockActionBar({
	label,
	dragHandle,
}: {
	label?: string | undefined;
	dragHandle?: ReactNode;
}) {
	const actions = useBlockActions();
	const zoom = useCanvasZoom();
	const [ref, shift] = useUnclippedShift();
	return (
		<div
			ref={ref}
			className="flex"
			style={{
				transform: `translateY(${shift}px) scale(${1 / zoom})`,
				transformOrigin: "right bottom",
			}}
		>
			<ActionBar>
				{dragHandle && <ActionBar.Group>{dragHandle}</ActionBar.Group>}
				{label && (
					<ActionBar.Group>
						<ActionBar.Label label={label} />
					</ActionBar.Group>
				)}
				<ActionBar.Group>
					<ActionBar.Action label="Duplicate" onClick={actions.duplicate}>
						<CopyPlusIcon className="size-4" />
					</ActionBar.Action>
					<ActionBar.Action label="Delete" onClick={actions.remove}>
						<Trash2Icon className="size-4" />
					</ActionBar.Action>
				</ActionBar.Group>
			</ActionBar>
		</div>
	);
}

function BlockOverlay({
	hover,
	isSelected,
	componentType,
}: {
	hover: boolean;
	isSelected: boolean;
	componentType: string;
}) {
	const zoom = useCanvasZoom();
	const label = usePuck(
		(s) => s.config.components[componentType]?.label ?? componentType,
	);
	if (!hover && !isSelected) return null;
	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-0 rounded-sm ring-2 ring-inset",
				isSelected ? "ring-sky-600" : "bg-sky-500/5 ring-sky-400",
			)}
		>
			{hover && !isSelected && (
				<span
					className="absolute top-0 left-0 origin-top-left rounded-br bg-sky-600 px-1.5 py-0.5 font-medium text-[11px] text-white"
					style={{ transform: `scale(${1 / zoom})` }}
				>
					{label}
				</span>
			)}
		</div>
	);
}

export const chromeOverrides: Partial<Overrides> = {
	actionBar: ({ label, dragHandle }) => (
		<BlockActionBar label={label} dragHandle={dragHandle} />
	),
	componentOverlay: ({ hover, isSelected, componentType }) => (
		<BlockOverlay
			hover={hover}
			isSelected={isSelected}
			componentType={componentType}
		/>
	),
};
