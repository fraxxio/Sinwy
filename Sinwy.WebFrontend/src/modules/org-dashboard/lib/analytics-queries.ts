import type {
	AnalyticsRangeQuery,
	BookingsBreakdownDto,
	BookingsDto,
	FunnelDto,
	TrafficBreakdownDto,
	TrafficDto,
} from "@sinwy/shared";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { analyticsPath } from "#/modules/org-dashboard/lib/analytics-search";
import { toQueryString } from "#/modules/org-dashboard/lib/booking-search";
import { api } from "#/shared/lib/api";

const REPORTS = {
	traffic: "/traffic",
	trafficBreakdown: "/traffic/breakdown",
	bookings: "/bookings",
	bookingsBreakdown: "/bookings/breakdown",
	funnel: "/funnel",
} as const;

type AnalyticsReportDtos = {
	traffic: TrafficDto;
	trafficBreakdown: TrafficBreakdownDto;
	bookings: BookingsDto;
	bookingsBreakdown: BookingsBreakdownDto;
	funnel: FunnelDto;
};

/** Days only change once a day, so a report stays fresh for a while. */
const STALE_MS = 5 * 60_000;

export const analyticsQuery = <K extends keyof AnalyticsReportDtos>(
	organizationId: string,
	report: K,
	range: AnalyticsRangeQuery,
) =>
	queryOptions({
		queryKey: ["analytics", organizationId, report, range] as const,
		queryFn: async () => {
			const res = await api<AnalyticsReportDtos[K]>(
				analyticsPath(
					organizationId,
					`${REPORTS[report]}${toQueryString({ from: range.from, to: range.to })}`,
				),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		staleTime: STALE_MS,
		placeholderData: keepPreviousData,
	});
