import { z } from "zod";
import type { DeviceType } from "./AnalyticsEvent";

const localDate = z.iso.date("Use a date like 2026-12-24");

const rangeFields = { from: localDate.optional(), to: localDate.optional() };

const fromNotAfterTo = (range: {
	from?: string | undefined;
	to?: string | undefined;
}) => !range.from || !range.to || range.from <= range.to;

const reversedRange = {
	message: "The start date must not be after the end date",
	path: ["to"],
};

/**
 * Inclusive dates, local to the organization. The default is the last 30
 * complete days; `to` is capped at yesterday and `from` at the plan's
 * retention window.
 */
export const analyticsRangeQuerySchema = z
	.object(rangeFields)
	.refine(fromNotAfterTo, reversedRange);

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;

export const ANALYTICS_REPORTS = ["traffic", "bookings", "funnel"] as const;
export type AnalyticsReport = (typeof ANALYTICS_REPORTS)[number];

export const analyticsExportQuerySchema = z
	.object({ ...rangeFields, report: z.enum(ANALYTICS_REPORTS) })
	.refine(fromNotAfterTo, reversedRange);

export type AnalyticsExportQuery = z.infer<typeof analyticsExportQuerySchema>;

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

/** `bookings` counts bookings made that day; `bookedMinor` is the confirmed and completed value of those starting that day. */
export type BookingCountsDto = { bookings: number; bookedMinor: number };

export type BookingsDto = {
	range: AnalyticsRangeDto;
	totals: BookingCountsDto;
	series: (BookingCountsDto & { date: string })[];
};

/** Bookings made in the range, per service, most booked first. */
export type ServiceBookingsDto = BookingCountsDto & {
	serviceId: string;
	name: string;
};

/** Rates are fractions from 0 to 1, null with nothing to divide by. */
export type CancellationRateDto = {
	bookings: number;
	cancelledByCustomer: number;
	cancelledByOrganization: number;
	rate: number | null;
	customerRate: number | null;
	organizationRate: number | null;
};

/** No-shows out of the bookings that were completed or no-shows. */
export type NoShowRateDto = {
	finished: number;
	noShows: number;
	rate: number | null;
};

export type BookingsBreakdownDto = {
	range: AnalyticsRangeDto;
	services: ServiceBookingsDto[];
	cancellation: CancellationRateDto;
	noShow: NoShowRateDto;
};

/** Visitors who viewed, visitors who started booking, then storefront bookings. */
export const ANALYTICS_FUNNEL_STEPS = ["viewed", "started", "booked"] as const;
export type AnalyticsFunnelStep = (typeof ANALYTICS_FUNNEL_STEPS)[number];

export type FunnelDto = {
	range: AnalyticsRangeDto;
	steps: { step: AnalyticsFunnelStep; count: number }[];
};
