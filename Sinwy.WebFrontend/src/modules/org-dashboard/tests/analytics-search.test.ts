import { expect, it } from "bun:test";
import { ANALYTICS_LIMITS } from "@sinwy/shared";
import {
	ANALYTICS_TABS,
	analyticsExportUrl,
	analyticsPresets,
	analyticsSearchSchema,
} from "#/modules/org-dashboard/lib/analytics-search";

it("defaults to the traffic tab and the API's range", () => {
	expect(analyticsSearchSchema.parse({})).toEqual({ tab: "traffic" });
});

it("round-trips a range and a tab", () => {
	for (const tab of ANALYTICS_TABS) {
		const search = { from: "2026-10-01", to: "2026-10-31", tab };
		expect(analyticsSearchSchema.parse(search)).toEqual(search);
	}
});

it("falls back to the defaults on bad values instead of failing", () => {
	expect(
		analyticsSearchSchema.parse({
			from: "last-week",
			to: "2026-02-30",
			tab: "revenue",
		}),
	).toEqual({ tab: "traffic" });
	expect(
		analyticsSearchSchema.parse({
			from: "2026-11-02",
			to: "2026-11-01",
			tab: "bookings",
		}),
	).toStrictEqual({ from: undefined, to: undefined, tab: "bookings" });
	expect(
		analyticsSearchSchema.parse({ to: "2026-11-01", tab: "conversion" }),
	).toStrictEqual({ from: undefined, to: undefined, tab: "conversion" });
});

it("resolves each preset to complete days ending yesterday", () => {
	const now = new Date("2026-11-09T12:00:00Z");
	expect(analyticsPresets("UTC", now)).toEqual([
		{ label: "7 days", from: "2026-11-02", to: "2026-11-08" },
		{ label: "30 days", from: "2026-10-10", to: "2026-11-08" },
		{ label: "90 days", from: "2026-08-11", to: "2026-11-08" },
	]);
});

it("makes the 30-day preset the API's default range", () => {
	const now = new Date("2026-11-09T12:00:00Z");
	const preset = analyticsPresets("UTC", now).find(
		(item) => item.label === `${ANALYTICS_LIMITS.defaultRangeDays} days`,
	);
	expect(preset).toMatchObject({ from: "2026-10-10", to: "2026-11-08" });
});

it("exports the active tab's report for the range", () => {
	expect(
		analyticsExportUrl("org-1", "conversion", {
			from: "2026-10-01",
			to: "2026-10-31",
		}),
	).toBe(
		"/api/organizations/org-1/analytics/export?report=funnel&from=2026-10-01&to=2026-10-31",
	);
	expect(analyticsExportUrl("org-1", "traffic", {})).toBe(
		"/api/organizations/org-1/analytics/export?report=traffic",
	);
});
