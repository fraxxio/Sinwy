import type { CSSProperties } from "react";
import type { Breakpoint } from "./responsive";

export type GridCell = { x: number; y: number; w: number; h: number };
export type PlacedCell = GridCell & { i: string };
export type CellMap = Record<string, GridCell>;
export type FreeGridLayout = {
	desktop: CellMap;
	tablet?: CellMap;
	mobile?: CellMap;
};

export const FREE_GRID = {
	cols: 12,
	rowHeight: 40,
	gap: 16,
	newCell: { w: 6, h: 2 },
} as const;

const whole = (value: unknown, min: number, max: number, fallback: number) =>
	typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, Math.round(value)))
		: fallback;

const sanitize = (cell: Partial<GridCell>): GridCell => {
	const w = whole(cell.w, 1, FREE_GRID.cols, FREE_GRID.newCell.w);
	return {
		x: whole(cell.x, 0, FREE_GRID.cols - w, 0),
		y: whole(cell.y, 0, 999, 0),
		w,
		h: whole(cell.h, 1, 99, FREE_GRID.newCell.h),
	};
};

/** One cell per child, in child order. Children without a stored cell stack below the placed ones. */
export function resolveCells(
	childIds: readonly string[],
	stored: CellMap | undefined,
): PlacedCell[] {
	const known = childIds.flatMap((i) =>
		stored?.[i] ? [{ i, ...sanitize(stored[i]) }] : [],
	);
	let bottom = Math.max(0, ...known.map((c) => c.y + c.h));
	return childIds.map((i) => {
		const placed = known.find((c) => c.i === i);
		if (placed) return placed;
		const cell = { i, x: 0, y: bottom, ...FREE_GRID.newCell };
		bottom += cell.h;
		return cell;
	});
}

export const toCellMap = (cells: readonly PlacedCell[]): CellMap =>
	Object.fromEntries(cells.map(({ i, x, y, w, h }) => [i, { x, y, w, h }]));

export const gridStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: `repeat(${FREE_GRID.cols}, minmax(0, 1fr))`,
	gridAutoRows: `${FREE_GRID.rowHeight}px`,
	gap: `${FREE_GRID.gap}px`,
};

export const cellPlacement = ({ x, y, w, h }: GridCell) => ({
	gridColumn: `${x + 1} / span ${w}`,
	gridRow: `${y + 1} / span ${h}`,
});

export const LAYOUT_KEYS = {
	base: "desktop",
	tablet: "tablet",
	mobile: "mobile",
} as const satisfies Record<Breakpoint, keyof FreeGridLayout>;

/** Full width, one under another, in the order they read on the wider layout. */
export function stackCells(cells: readonly PlacedCell[]): PlacedCell[] {
	let y = 0;
	return [...cells]
		.sort((a, b) => a.y - b.y || a.x - b.x)
		.map(({ i, h }) => {
			const cell = { i, x: 0, y, w: FREE_GRID.cols, h };
			y += h;
			return cell;
		});
}

/** Tablet without its own layout uses desktop's; phone without its own stacks the tablet layout. */
export function cellsByBreakpoint(
	childIds: readonly string[],
	layout: Partial<FreeGridLayout> | undefined,
): Record<Breakpoint, PlacedCell[]> {
	const base = resolveCells(childIds, layout?.desktop);
	const tablet = layout?.tablet ? resolveCells(childIds, layout.tablet) : base;
	const mobile = layout?.mobile
		? resolveCells(childIds, layout.mobile)
		: stackCells(tablet);
	return { base, tablet, mobile };
}

/** Per child, its grid column and row on each breakpoint, in `childIds` order. */
export const placementsByChild = (
	childIds: readonly string[],
	layout: Partial<FreeGridLayout> | undefined,
) => {
	const byBreakpoint = cellsByBreakpoint(childIds, layout);
	return childIds.map((i) => {
		const at = (breakpoint: Breakpoint) => {
			const cell = byBreakpoint[breakpoint].find((c) => c.i === i);
			return cell
				? cellPlacement(cell)
				: { gridColumn: "auto", gridRow: "auto" };
		};
		const base = at("base");
		const tablet = at("tablet");
		const mobile = at("mobile");
		return {
			i,
			column: {
				base: base.gridColumn,
				tablet: tablet.gridColumn,
				mobile: mobile.gridColumn,
			},
			row: {
				base: base.gridRow,
				tablet: tablet.gridRow,
				mobile: mobile.gridRow,
			},
		};
	});
};
