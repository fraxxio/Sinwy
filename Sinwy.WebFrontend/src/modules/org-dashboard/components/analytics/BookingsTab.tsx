import type { AnalyticsRangeQuery } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon } from "lucide-react";
import {
	BreakdownTable,
	formatCount,
	formatRate,
	SeriesChart,
	StatCard,
} from "#/modules/org-dashboard/components/analytics/AnalyticsWidgets";
import { analyticsQuery } from "#/modules/org-dashboard/lib/analytics-queries";
import { EmptyState } from "#/shared/components/EmptyState";
import { PlanGate } from "#/shared/components/PlanGate";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { formatMinorUnits } from "#/shared/lib/money";

const VOLUME_CHART = {
	bookings: { label: "Bookings made", color: "var(--chart-1)" },
};

const VALUE_CHART = {
	bookedMinor: { label: "Booked value", color: "var(--chart-2)" },
};

export function BookingsTab({
	organizationId,
	range,
}: {
	organizationId: string;
	range: AnalyticsRangeQuery;
}) {
	const bookings = useQuery(analyticsQuery(organizationId, "bookings", range));

	if (bookings.isError)
		return <FieldError>{bookings.error.message}</FieldError>;
	if (!bookings.data) return <Skeleton className="h-64 rounded-md" />;

	const { totals, series, range: resolved } = bookings.data;
	const money = (minor: number) => formatMinorUnits(minor, resolved.currency);

	if (totals.bookings === 0 && totals.bookedMinor === 0)
		return (
			<EmptyState
				icon={<CalendarIcon />}
				title="No bookings in this range"
				description="Bookings show up here the day after they're made."
				className="border-none"
			/>
		);

	return (
		<div className="grid gap-4">
			<div className="grid gap-3 sm:grid-cols-2">
				<StatCard
					title="Bookings made"
					value={formatCount(totals.bookings)}
					hint="By the day the booking was made."
				/>
				<StatCard
					title="Booked value"
					value={money(totals.bookedMinor)}
					hint="Confirmed and completed bookings, by appointment date."
				/>
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<SeriesChart
					title="Bookings made"
					description="By the day the booking was made"
					data={series}
					config={VOLUME_CHART}
				/>
				<SeriesChart
					title="Booked value"
					description="By appointment date"
					data={series}
					config={VALUE_CHART}
					formatValue={money}
				/>
			</div>
			<PlanGate feature="analytics-advanced">
				<BookingsBreakdown
					organizationId={organizationId}
					range={range}
					money={money}
				/>
			</PlanGate>
		</div>
	);
}

function BookingsBreakdown({
	organizationId,
	range,
	money,
}: {
	organizationId: string;
	range: AnalyticsRangeQuery;
	money: (minor: number) => string;
}) {
	const breakdown = useQuery(
		analyticsQuery(organizationId, "bookingsBreakdown", range),
	);

	if (breakdown.isError)
		return <FieldError>{breakdown.error.message}</FieldError>;
	if (!breakdown.data) return <Skeleton className="h-48 rounded-md" />;

	const { services, cancellation, noShow } = breakdown.data;

	return (
		<div className="grid gap-4 lg:grid-cols-3">
			<div className="lg:col-span-2">
				<BreakdownTable
					title="By service"
					columns={["Service", "Bookings made", "Value of bookings made"]}
					empty="No bookings made in this range."
					rows={services.map((service) => ({
						key: service.serviceId,
						cells: [
							service.name,
							formatCount(service.bookings),
							money(service.bookedMinor),
						],
					}))}
				/>
			</div>
			<div className="grid content-start gap-3">
				<StatCard
					title="Cancellation rate"
					value={formatRate(cancellation.rate)}
					hint={`By customers ${formatRate(cancellation.customerRate)}, by you ${formatRate(cancellation.organizationRate)}, of ${formatCount(cancellation.bookings)} bookings by appointment date.`}
				/>
				<StatCard
					title="No-show rate"
					value={formatRate(noShow.rate)}
					hint={`${formatCount(noShow.noShows)} of ${formatCount(noShow.finished)} finished bookings.`}
				/>
			</div>
		</div>
	);
}
