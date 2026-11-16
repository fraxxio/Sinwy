import {
	type ComponentData,
	createUsePuck,
	type PuckComponent,
	useGetPuck,
} from "@puckeditor/core";
import { useState } from "react";
import ReactGridLayout, {
	type EventCallback,
	getCompactor,
	type Layout,
	useContainerWidth,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import {
	cellPlacement,
	FREE_GRID,
	gridStyle,
	type PlacedCell,
	resolveCells,
	toCellMap,
} from "./free-grid-layout";
import type { BuilderComponents } from "./render-config";

const usePuck = createUsePuck();
/** No compaction and no overlap: a move or resize into an occupied cell snaps back. */
const compactor = getCompactor(null, false, true);

const sameCells = (a: readonly PlacedCell[], b: readonly PlacedCell[]) =>
	a.length === b.length &&
	a.every((c, n) => {
		const d = b[n];
		return (
			d &&
			c.i === d.i &&
			c.x === d.x &&
			c.y === d.y &&
			c.w === d.w &&
			c.h === d.h
		);
	});

const fromRgl = (layout: Layout, order: readonly string[]): PlacedCell[] =>
	order.flatMap((i) => {
		const item = layout.find((l) => l.i === i);
		return item ? [{ i, x: item.x, y: item.y, w: item.w, h: item.h }] : [];
	});

const OVERLAY_CSS = `
[data-freegrid-overlay] .react-grid-item { pointer-events: none !important; outline: 1px dashed color-mix(in oklab, var(--color-primary) 35%, transparent); border-radius: 6px; }
[data-freegrid-overlay] .react-grid-item:hover { outline-style: solid; }
[data-freegrid-overlay] .react-grid-placeholder { background: var(--color-primary); opacity: 0.15; border-radius: 6px; }
[data-freegrid-overlay] .react-resizable-handle, [data-freegrid-overlay] [data-freegrid-handle] { pointer-events: auto !important; }
`;

/** Editor-only FreeGrid: the slot renders on a CSS grid, and a transparent RGL layer on top moves and resizes the cells. */
export const FreeGridEditor: PuckComponent<BuilderComponents["FreeGrid"]> = ({
	id,
	items: Items,
	layout,
}) => {
	const getPuck = useGetPuck();
	const idList = usePuck(
		(s) =>
			(s.getItemById(id)?.props.items as ComponentData[] | undefined)
				?.map((child) => child.props.id)
				.join("\n") ?? "",
	);
	const childIds = idList ? idList.split("\n") : [];
	const stored = resolveCells(childIds, layout?.desktop);
	const [live, setLive] = useState<PlacedCell[] | null>(null);
	const cells = live ?? stored;
	const { width, containerRef, mounted } = useContainerWidth();
	const showOverlay = mounted && cells.length > 0;

	const select = (childId: string) => {
		const { getSelectorForId, dispatch } = getPuck();
		const itemSelector = getSelectorForId(childId);
		if (itemSelector) dispatch({ type: "setUi", ui: { itemSelector } });
	};

	/** Puck drags and selects on pointerdown and click; the grid layer keeps both to itself. */
	const bindOverlay = (overlay: HTMLDivElement | null) => {
		if (!overlay) return;
		const stop = (event: Event) => event.stopPropagation();
		const selectChild = (event: Event) => {
			event.stopPropagation();
			const handle = (event.target as Element).closest(
				"[data-freegrid-handle]",
			);
			const childId = handle?.getAttribute("data-freegrid-handle");
			if (childId) select(childId);
		};
		overlay.addEventListener("pointerdown", stop);
		overlay.addEventListener("click", selectChild);
		return () => {
			overlay.removeEventListener("pointerdown", stop);
			overlay.removeEventListener("click", selectChild);
		};
	};

	const track = (next: Layout) => {
		const nextCells = fromRgl(next, childIds);
		setLive((prev) => (prev && sameCells(prev, nextCells) ? prev : nextCells));
	};

	/** The click that ends a gesture would select the FreeGrid; select the moved block instead. */
	const finish: EventCallback = (next, _old, item, _placeholder, event) => {
		const doc = (event.target as Node | null)?.ownerDocument;
		const swallow = (click: Event) => click.stopPropagation();
		doc?.addEventListener("click", swallow, { capture: true });
		setTimeout(() =>
			doc?.removeEventListener("click", swallow, { capture: true }),
		);
		commit(next);
		if (item) select(item.i);
	};

	const commit = (next: Layout) => {
		setLive(null);
		const nextCells = fromRgl(next, childIds);
		if (sameCells(nextCells, stored)) return;
		const { getItemById, getSelectorForId, dispatch } = getPuck();
		const item = getItemById(id);
		const selector = getSelectorForId(id);
		if (!item || !selector?.zone) return;
		dispatch({
			type: "replace",
			destinationIndex: selector.index,
			destinationZone: selector.zone,
			data: {
				...item,
				props: {
					...item.props,
					layout: { ...item.props.layout, desktop: toCellMap(nextCells) },
				},
			},
		});
	};

	const placement = cells
		.map((cell) => {
			const { gridColumn, gridRow } = cellPlacement(cell);
			return `[data-freegrid="${CSS.escape(id)}"] > * > [data-puck-component="${CSS.escape(cell.i)}"] { grid-column: ${gridColumn}; grid-row: ${gridRow}; }`;
		})
		.join("\n");

	return (
		<div data-freegrid={id} ref={containerRef} className="relative">
			<style>{OVERLAY_CSS + placement}</style>
			<Items minEmptyHeight={FREE_GRID.rowHeight * 3} style={gridStyle} />
			{showOverlay && (
				<div
					ref={bindOverlay}
					data-freegrid-overlay=""
					className="pointer-events-none absolute inset-0"
				>
					<ReactGridLayout
						width={width}
						layout={cells}
						compactor={compactor}
						gridConfig={{
							cols: FREE_GRID.cols,
							rowHeight: FREE_GRID.rowHeight,
							margin: [FREE_GRID.gap, FREE_GRID.gap],
							containerPadding: [0, 0],
						}}
						dragConfig={{ handle: "[data-freegrid-handle]" }}
						resizeConfig={{ handles: ["se", "e", "s"] }}
						onDrag={track}
						onResize={track}
						onDragStop={finish}
						onResizeStop={finish}
					>
						{cells.map((cell) => (
							<div key={cell.i}>
								<button
									type="button"
									data-freegrid-handle={cell.i}
									aria-label="Move block"
									className="absolute -top-3 -left-3 z-10 grid size-6 cursor-move place-items-center rounded-full border bg-background text-muted-foreground text-xs shadow-sm"
								>
									⠿
								</button>
							</div>
						))}
					</ReactGridLayout>
				</div>
			)}
		</div>
	);
};
