import { BOOKING_LIMITS, CUSTOMER_BOOKING_TABS } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CalendarCheckIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	HistoryIcon,
} from "lucide-react";
import { z } from "zod";
import { CustomerBookingList } from "#/modules/account-dashboard/components/bookings/CustomerBookingList";
import { accountBookingsQuery } from "#/modules/account-dashboard/lib/booking-queries";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { cn } from "#/shared/lib/utils";

const searchSchema = z.object({
	tab: z.enum(CUSTOMER_BOOKING_TABS).optional().catch(undefined),
	page: z.coerce.number().int().min(2).optional().catch(undefined),
});

export const Route = createFileRoute("/account/_shell/bookings/")({
	validateSearch: searchSchema,
	component: BookingsPage,
});

const TAB_LABELS = { upcoming: "Upcoming", past: "Past" } as const;

function BookingsPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const tab = search.tab ?? "upcoming";
	const page = search.page ?? 1;
	const bookings = useQuery(accountBookingsQuery(tab, page));

	const pageSize = BOOKING_LIMITS.customerListPageSize;
	const pages = Math.max(1, Math.ceil((bookings.data?.total ?? 0) / pageSize));
	const goToPage = (next: number) =>
		void navigate({
			search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }),
		});

	return (
		<>
			<PageHeader
				title="Bookings"
				description="Appointments you've booked with businesses on Sinwy."
			/>
			<div className="flex gap-1 rounded-lg border p-1 self-start">
				{CUSTOMER_BOOKING_TABS.map((value) => (
					<Button
						key={value}
						size="sm"
						variant="ghost"
						aria-pressed={tab === value}
						className={cn(tab === value && "bg-muted")}
						onClick={() =>
							void navigate({
								search: {
									tab: value === "upcoming" ? undefined : value,
								},
							})
						}
					>
						{TAB_LABELS[value]}
					</Button>
				))}
			</div>
			{bookings.isError ? (
				<FieldError>{bookings.error.message}</FieldError>
			) : bookings.isPending ? (
				<Skeleton className="h-48 rounded-xl" />
			) : bookings.data.items.length === 0 ? (
				page > 1 ? (
					<p className="py-10 text-center text-muted-foreground text-sm">
						This page is empty.
						<Button variant="link" onClick={() => goToPage(1)}>
							Back to the first page
						</Button>
					</p>
				) : tab === "upcoming" ? (
					<EmptyState
						icon={<CalendarCheckIcon />}
						title="No upcoming bookings"
						description="Bookings are made on a business's own booking page. Once you book there, your appointments show up here."
					/>
				) : (
					<EmptyState
						icon={<HistoryIcon />}
						title="No past bookings"
						description="Finished and cancelled bookings show up here."
					/>
				)
			) : (
				<div className="space-y-3">
					<CustomerBookingList bookings={bookings.data.items} />
					{pages > 1 && (
						<div className="flex items-center justify-end gap-1 text-muted-foreground text-sm">
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Previous page"
								disabled={page <= 1}
								onClick={() => goToPage(page - 1)}
							>
								<ChevronLeftIcon />
							</Button>
							<span className="px-2 tabular-nums">
								Page {page} of {pages}
							</span>
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Next page"
								disabled={page >= pages}
								onClick={() => goToPage(page + 1)}
							>
								<ChevronRightIcon />
							</Button>
						</div>
					)}
				</div>
			)}
		</>
	);
}
