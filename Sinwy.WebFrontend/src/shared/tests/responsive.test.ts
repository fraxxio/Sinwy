import { expect, it } from "bun:test";
import {
	cellsByBreakpoint,
	placementsByChild,
} from "../components/page-builder/free-grid-layout";
import {
	hiddenOn,
	mapResolved,
	resolveResponsive,
	responsiveVars,
} from "../components/page-builder/responsive";

const SIZES = ["small", "medium", "large"] as const;
const PX = { small: "4px", medium: "8px", large: "16px" };

it("maps a responsive value to three CSS variables, unset breakpoints following the next wider one", () => {
	const vars = (value: unknown) => <Record<string, string>>responsiveVars(
			"pad",
			mapResolved(
				resolveResponsive(value, SIZES, "medium"),
				(size) => PX[size],
			),
		);
	expect(vars({ base: "large", mobile: "small" })).toEqual({
		"--pb-pad": "16px",
		"--pb-pad-t": "16px",
		"--pb-pad-m": "4px",
	});
	expect(vars({ base: "large", tablet: "small" })).toEqual({
		"--pb-pad": "16px",
		"--pb-pad-t": "4px",
		"--pb-pad-m": "4px",
	});
});

it("reads a plain value as desktop and falls back on unknown or missing values", () => {
	expect(resolveResponsive("large", SIZES, "medium")).toEqual({
		base: "large",
		tablet: "large",
		mobile: "large",
	});
	expect(
		resolveResponsive(
			{ base: "huge", tablet: 3, mobile: "small" },
			SIZES,
			"medium",
		),
	).toEqual({ base: "medium", tablet: "medium", mobile: "small" });
	expect(resolveResponsive(undefined, SIZES, "medium").mobile).toBe("medium");
});

it("lists the breakpoints a block is hidden on", () => {
	expect(hiddenOn({ base: "show", mobile: "hide" })).toBe("mobile");
	expect(hiddenOn({ base: "hide", mobile: "show" })).toBe("base tablet");
	expect(hiddenOn(undefined)).toBe("");
});

it("uses desktop's grid on tablet and stacks on phone until those have their own layout", () => {
	const desktop = {
		b: { x: 6, y: 0, w: 6, h: 3 },
		a: { x: 0, y: 0, w: 6, h: 2 },
		c: { x: 0, y: 4, w: 12, h: 1 },
	};
	const cells = cellsByBreakpoint(["c", "b", "a"], { desktop });
	expect(cells.tablet).toEqual(cells.base);
	expect(cells.mobile).toEqual([
		{ i: "a", x: 0, y: 0, w: 12, h: 2 },
		{ i: "b", x: 0, y: 2, w: 12, h: 3 },
		{ i: "c", x: 0, y: 5, w: 12, h: 1 },
	]);

	const own = cellsByBreakpoint(["a", "b"], {
		desktop,
		mobile: { b: { x: 0, y: 0, w: 12, h: 2 } },
	});
	expect(own.mobile).toEqual([
		{ i: "a", x: 0, y: 2, w: 6, h: 2 },
		{ i: "b", x: 0, y: 0, w: 12, h: 2 },
	]);
	expect(placementsByChild(["b"], { desktop, tablet: {} })[0]).toEqual({
		i: "b",
		column: { base: "7 / span 6", tablet: "1 / span 6", mobile: "1 / span 12" },
		row: { base: "1 / span 3", tablet: "1 / span 2", mobile: "1 / span 2" },
	});
});
