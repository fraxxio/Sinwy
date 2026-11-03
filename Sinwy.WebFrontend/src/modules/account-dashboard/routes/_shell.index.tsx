import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";
import { BookAgainCard } from "#/modules/account-dashboard/components/overview/BookAgainCard";
import { NextBookingCard } from "#/modules/account-dashboard/components/overview/NextBookingCard";
import { accountBookingSummaryQuery } from "#/modules/account-dashboard/lib/booking-queries";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

export const Route = createFileRoute("/account/_shell/")({
	component: AccountOverviewPage,
});

function AccountOverviewPage() {
	const summary = useQuery(accountBookingSummaryQuery());

	return (
		<>
			<PageHeader
				title="Overview"
				description="Your bookings, payments and organizations at a glance."
			/>
			{summary.isError ? (
				<FieldError>{summary.error.message}</FieldError>
			) : summary.isPending ? (
				<Skeleton className="h-48 rounded-xl" />
			) : !summary.data.next && summary.data.rebook.length === 0 ? (
				<EmptyState
					icon={<LayoutDashboardIcon />}
					title="Nothing to show yet"
					description="Once you book a service or join an organization, your activity will show up here."
				/>
			) : (
				<div className="grid gap-4 lg:grid-cols-2">
					{summary.data.next && <NextBookingCard booking={summary.data.next} />}
					{summary.data.rebook.length > 0 && (
						<BookAgainCard services={summary.data.rebook} />
					)}
				</div>
			)}
		</>
	);
}
