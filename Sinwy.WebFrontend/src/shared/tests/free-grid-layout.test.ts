import { expect, it } from "bun:test";
import {
	cellPlacement,
	resolveCells,
} from "../components/page-builder/free-grid-layout";

it("maps a stored layout to CSS Grid placements, stacking unplaced children below", () => {
	const cells = resolveCells(["a", "b", "new-1", "new-2"], {
		a: { x: 0, y: 0, w: 4, h: 2 },
		b: { x: 6, y: 1, w: 6, h: 3 },
		gone: { x: 0, y: 9, w: 12, h: 1 },
	});
	expect(cells.map((cell) => ({ i: cell.i, ...cellPlacement(cell) }))).toEqual([
		{ i: "a", gridColumn: "1 / span 4", gridRow: "1 / span 2" },
		{ i: "b", gridColumn: "7 / span 6", gridRow: "2 / span 3" },
		{ i: "new-1", gridColumn: "1 / span 6", gridRow: "5 / span 2" },
		{ i: "new-2", gridColumn: "1 / span 6", gridRow: "7 / span 2" },
	]);
});

it("clamps out-of-range and malformed cells into the grid", () => {
	const cells = resolveCells(["a", "b"], {
		a: { x: 10, y: -3, w: 8, h: 0 },
		b: { x: Number.NaN, y: 2.6, w: 40, h: 1 } as never,
	});
	expect(cells).toEqual([
		{ i: "a", x: 4, y: 0, w: 8, h: 1 },
		{ i: "b", x: 0, y: 3, w: 12, h: 1 },
	]);
});
