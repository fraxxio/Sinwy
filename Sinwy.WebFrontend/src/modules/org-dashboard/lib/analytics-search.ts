import type { AnalyticsRangeQuery, AnalyticsReport } from "@sinwy/shared";
import { z } from "zod";
import { toQueryString } from "#/modules/org-dashboard/lib/booking-search";
import {
	completeDaysRange,
	type DateRangePreset,
	optionalDate,
	validRangeOr,
} from "#/modules/org-dashboard/lib/date-range";

export const ANALYTICS_TABS = ["traffic", "conversion", "bookings"] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

export const ANALYTICS_TAB_LABELS: Record<AnalyticsTab, string> = {
	traffic: "Traffic",
	conversion: "Conversion",
	bookings: "Bookings",
};

/** The CSV each tab exports. */
export const ANALYTICS_TAB_REPORTS: Record<AnalyticsTab, AnalyticsReport> = {
	traffic: "traffic",
	conversion: "funnel",
	bookings: "bookings",
};

/** No range means the API's default (the last 30 complete days); bad values fall back to the defaults. */
export const analyticsSearchSchema = z
	.object({
		from: optionalDate,
		to: optionalDate,
		tab: z.enum(ANALYTICS_TABS).default("traffic").catch("traffic"),
	})
	.transform(validRangeOr);

export type AnalyticsSearch = z.infer<typeof analyticsSearchSchema>;

export const ANALYTICS_SEARCH_DEFAULTS = analyticsSearchSchema.parse({});

export const ANALYTICS_PRESET_DAYS = [7, 30, 90] as const;

/** Each preset is complete days ending yesterday, in the org's timezone. */
export const analyticsPresets = (
	timezone: string,
	now = new Date(),
): DateRangePreset[] =>
	ANALYTICS_PRESET_DAYS.map((days) => ({
		label: `${days} days`,
		...completeDaysRange(days, timezone, now),
	}));

export const analyticsPath = (organizationId: string, suffix = "") =>
	`/organizations/${organizationId}/analytics${suffix}`;

/** Same-origin URL of a tab's CSV, with no range meaning the API's default; the browser downloads it with the session cookie. */
export const analyticsExportUrl = (
	organizationId: string,
	tab: AnalyticsTab,
	range: AnalyticsRangeQuery,
) =>
	`/api${analyticsPath(
		organizationId,
		`/export${toQueryString({ report: ANALYTICS_TAB_REPORTS[tab], ...range })}`,
	)}`;
