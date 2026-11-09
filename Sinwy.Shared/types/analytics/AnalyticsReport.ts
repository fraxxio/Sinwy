import { z } from "zod";
import type { DeviceType } from "./AnalyticsEvent";

const localDate = z.iso.date("Use a date like 2026-12-24");

/**
 * Inclusive dates, local to the organization. The default is the last 30
 * complete days; `to` is capped at yesterday and `from` at the plan's
 * retention window.
 */
export const analyticsRangeQuerySchema = z
	.object({ from: localDate.optional(), to: localDate.optional() })
	.refine((range) => !range.from || !range.to || range.from <= range.to, {
		message: "The start date must not be after the end date",
		path: ["to"],
	});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;

export const ANALYTICS_LIMITS = {
	defaultRangeDays: 30,
	topReferrers: 20,
} as const;

/** The range actually served; `clamped` when the plan's retention cut `from`. */
export type AnalyticsRangeDto = {
	from: string;
	to: string;
	timezone: string;
	currency: string;
	retentionDays: number;
	clamped: boolean;
};

export type TrafficCountsDto = { views: number; visitors: number };

/** Unique visitors over several days are the sum of each day's. */
export type TrafficDto = {
	range: AnalyticsRangeDto;
	totals: TrafficCountsDto;
	series: (TrafficCountsDto & { date: string })[];
};

/** A null `pageId` is the booking page. */
export type TopPageDto = TrafficCountsDto & {
	pageId: string | null;
	title: string | null;
	slug: string | null;
};

/** A null `host` is direct traffic; `www.` is folded into the bare host. */
export type ReferrerDto = TrafficCountsDto & { host: string | null };

export type DeviceTrafficDto = TrafficCountsDto & { device: DeviceType };

export type TrafficBreakdownDto = {
	range: AnalyticsRangeDto;
	pages: TopPageDto[];
	referrers: ReferrerDto[];
	devices: DeviceTrafficDto[];
};
