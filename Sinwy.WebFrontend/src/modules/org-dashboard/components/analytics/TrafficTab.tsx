import type { AnalyticsRangeQuery, DeviceType } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesColumnIcon } from "lucide-react";
import {
	BreakdownTable,
	formatCount,
	SeriesChart,
	StatCard,
} from "#/modules/org-dashboard/components/analytics/AnalyticsWidgets";
import { analyticsQuery } from "#/modules/org-dashboard/lib/analytics-queries";
import { EmptyState } from "#/shared/components/EmptyState";
import { PlanGate } from "#/shared/components/PlanGate";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

const DEVICE_LABELS: Record<DeviceType, string> = {
	desktop: "Desktop",
	mobile: "Mobile",
	tablet: "Tablet",
};

const TRAFFIC_CHART = {
	views: { label: "Views", color: "var(--chart-1)" },
	visitors: { label: "Visitors", color: "var(--chart-2)" },
};

export function TrafficTab({
	organizationId,
	range,
}: {
	organizationId: string;
	range: AnalyticsRangeQuery;
}) {
	const traffic = useQuery(analyticsQuery(organizationId, "traffic", range));

	if (traffic.isError) return <FieldError>{traffic.error.message}</FieldError>;
	if (!traffic.data) return <Skeleton className="h-64 rounded-xl" />;

	const { totals, series } = traffic.data;
	if (totals.views === 0)
		return (
			<EmptyState
				icon={<ChartNoAxesColumnIcon />}
				title="No visits in this range"
				description="Views of your published pages and booking page show up here the day after they happen."
			/>
		);

	return (
		<div className="grid gap-4">
			<div className="grid gap-3 sm:grid-cols-2">
				<StatCard title="Views" value={formatCount(totals.views)} />
				<StatCard
					title="Visitors"
					value={formatCount(totals.visitors)}
					hint="Unique per day, added up over the range."
				/>
			</div>
			<SeriesChart
				title="Views and visitors"
				data={series}
				config={TRAFFIC_CHART}
			/>
			<PlanGate feature="analytics-advanced">
				<TrafficBreakdown organizationId={organizationId} range={range} />
			</PlanGate>
		</div>
	);
}

function TrafficBreakdown({
	organizationId,
	range,
}: {
	organizationId: string;
	range: AnalyticsRangeQuery;
}) {
	const breakdown = useQuery(
		analyticsQuery(organizationId, "trafficBreakdown", range),
	);

	if (breakdown.isError)
		return <FieldError>{breakdown.error.message}</FieldError>;
	if (!breakdown.data) return <Skeleton className="h-48 rounded-xl" />;

	const { pages, referrers, devices } = breakdown.data;
	const counts = (row: { views: number; visitors: number }) =>
		[formatCount(row.views), formatCount(row.visitors)] as const;

	return (
		<div className="grid gap-4 lg:grid-cols-3">
			<BreakdownTable
				title="Top pages"
				columns={["Page", "Views", "Visitors"]}
				empty="No page views."
				rows={pages.map((page) => ({
					key: page.pageId ?? "booking",
					cells: [
						page.pageId === null
							? "Booking page"
							: page.title || page.slug || "Untitled page",
						...counts(page),
					],
				}))}
			/>
			<BreakdownTable
				title="Referrers"
				columns={["Source", "Views", "Visitors"]}
				empty="No referrers."
				rows={referrers.map((referrer) => ({
					key: referrer.host ?? "direct",
					cells: [referrer.host ?? "Direct", ...counts(referrer)],
				}))}
			/>
			<BreakdownTable
				title="Devices"
				columns={["Device", "Views", "Visitors"]}
				empty="No devices."
				rows={devices.map((device) => ({
					key: device.device,
					cells: [DEVICE_LABELS[device.device], ...counts(device)],
				}))}
			/>
		</div>
	);
}
