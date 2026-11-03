import { hasPermission } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { OverviewStats } from "#/modules/org-dashboard/components/overview/OverviewStats";
import { PendingRequests } from "#/modules/org-dashboard/components/overview/PendingRequests";
import { TodayBookings } from "#/modules/org-dashboard/components/overview/TodayBookings";
import { bookingOverviewQuery } from "#/modules/org-dashboard/lib/booking-queries";
import { PageHeader } from "#/shared/components/PageHeader";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

export const Route = createFileRoute("/dashboard/$organizationSlug/_shell/")({
	component: OverviewPage,
});

const weekLabel = (week: { from: string; to: string }) =>
	`This week: ${format(parseISO(week.from), "d MMM")} – ${format(parseISO(week.to), "d MMM")}`;

function OverviewPage() {
	const { organization, member } = Route.useRouteContext();
	const overview = useQuery(bookingOverviewQuery(organization.id));

	if (overview.isError)
		return (
			<>
				<PageHeader title="Overview" />
				<FieldError>{overview.error.message}</FieldError>
			</>
		);
	if (overview.isPending)
		return (
			<>
				<PageHeader title="Overview" />
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{[0, 1, 2, 3].map((key) => (
						<Skeleton key={key} className="h-32 rounded-xl" />
					))}
				</div>
				<Skeleton className="h-64 rounded-xl" />
			</>
		);

	const data = overview.data;
	return (
		<>
			<PageHeader title="Overview" description={weekLabel(data.week)} />
			<OverviewStats organizationSlug={organization.slug} overview={data} />
			<div className="grid gap-4 lg:grid-cols-2">
				<TodayBookings
					organizationSlug={organization.slug}
					bookings={data.todayBookings}
					timezone={data.timezone}
				/>
				<PendingRequests
					organizationId={organization.id}
					organizationSlug={organization.slug}
					requests={data.pending.oldest}
					total={data.pending.total}
					timezone={data.timezone}
					canWrite={hasPermission(member.roles, "bookings:write")}
				/>
			</div>
		</>
	);
}
