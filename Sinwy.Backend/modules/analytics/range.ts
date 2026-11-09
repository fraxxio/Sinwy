import type { Membership } from "@authModule";
import { addDaysToDate } from "@backend/lib/localDate";
import { getOrganizationLocale } from "@organizationsModule";
import { todayIn } from "@servicesModule";
import {
	ANALYTICS_LIMITS,
	type AnalyticsRangeDto,
	type AnalyticsRangeQuery,
	limitsFor,
} from "@sinwy/shared";

export type AnalyticsRangeError = "no-retention" | "not-found";

const clamp = (date: string, min: string, max: string) =>
	date < min ? min : date > max ? max : date;

/**
 * Complete days only, within the retention window: the last `retentionDays`
 * days before today. A range wholly outside the window collapses onto its
 * nearest edge.
 */
export const clampAnalyticsRange = (
	query: AnalyticsRangeQuery,
	{ timezone, retentionDays }: { timezone: string; retentionDays: number },
	now: Date,
) => {
	const today = todayIn(timezone, now);
	const latest = addDaysToDate(today, -1);
	const earliest = addDaysToDate(today, -retentionDays);
	const to = query.to ?? latest;
	const from =
		query.from ??
		addDaysToDate(
			to < latest ? to : latest,
			1 - ANALYTICS_LIMITS.defaultRangeDays,
		);
	return {
		from: clamp(from, earliest, latest),
		to: clamp(to, earliest, latest),
		clamped: from < earliest,
	};
};

export const resolveAnalyticsRange = async (
	membership: Membership,
	query: AnalyticsRangeQuery,
	now = new Date(),
): Promise<
	| { ok: true; data: AnalyticsRangeDto }
	| { ok: false; error: AnalyticsRangeError }
> => {
	const { analyticsRetentionDays: retentionDays } = limitsFor(membership.plan);
	if (retentionDays <= 0) return { ok: false, error: "no-retention" };
	const locale = await getOrganizationLocale(membership.organizationId);
	if (!locale) return { ok: false, error: "not-found" };
	return {
		ok: true,
		data: {
			...clampAnalyticsRange(
				query,
				{ timezone: locale.timezone, retentionDays },
				now,
			),
			timezone: locale.timezone,
			currency: locale.currency,
			retentionDays,
		},
	};
};

/** Every date from `from` to `to`, inclusive. */
export const datesIn = ({ from, to }: { from: string; to: string }) => {
	const dates: string[] = [];
	for (let date = from; date <= to; date = addDaysToDate(date, 1))
		dates.push(date);
	return dates;
};
