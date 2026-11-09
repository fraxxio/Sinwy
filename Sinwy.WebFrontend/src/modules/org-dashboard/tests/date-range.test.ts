import { expect, it } from "bun:test";
import {
	changeRange,
	clampRange,
	completeDaysRange,
} from "#/modules/org-dashboard/lib/date-range";

it("moves the other end of the range instead of reversing it", () => {
	const range = { from: "2026-11-01", to: "2026-11-30" };
	expect(changeRange(range, { from: "2026-11-10" })).toEqual({
		from: "2026-11-10",
		to: "2026-11-30",
	});
	expect(changeRange(range, { from: "2026-12-05" })).toEqual({
		from: "2026-12-05",
		to: "2026-12-05",
	});
	expect(changeRange(range, { to: "2026-10-20" })).toEqual({
		from: "2026-10-20",
		to: "2026-10-20",
	});
});

it("counts complete days back from yesterday in the org's timezone", () => {
	// 23:30 UTC on 9 Nov is already 10 Nov in Vilnius
	const now = new Date("2026-11-09T23:30:00Z");
	expect(completeDaysRange(7, "UTC", now)).toEqual({
		from: "2026-11-02",
		to: "2026-11-08",
	});
	expect(completeDaysRange(7, "Europe/Vilnius", now)).toEqual({
		from: "2026-11-03",
		to: "2026-11-09",
	});
});

it("clamps a requested range into the window the API serves", () => {
	const window = { from: "2026-10-10", to: "2026-11-08" };
	expect(clampRange({ from: "2026-08-11", to: "2026-11-20" }, window)).toEqual(
		window,
	);
	expect(clampRange({ from: "2026-10-20", to: "2026-11-01" }, window)).toEqual({
		from: "2026-10-20",
		to: "2026-11-01",
	});
});
