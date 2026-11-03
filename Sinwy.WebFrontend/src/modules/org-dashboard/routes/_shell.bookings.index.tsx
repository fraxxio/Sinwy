import {
	type AvailabilityDto,
	hasPermission,
	type ServiceDto,
} from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	stripSearchParams,
	useRouter,
} from "@tanstack/react-router";
import { CalendarDaysIcon, ListIcon, PlusIcon } from "lucide-react";
import { BookingFilters } from "#/modules/org-dashboard/components/bookings/BookingFilters";
import { BookingsCalendar } from "#/modules/org-dashboard/components/bookings/BookingsCalendar";
import { BookingsList } from "#/modules/org-dashboard/components/bookings/BookingsList";
import {
	bookingCalendarQuery,
	bookingListQuery,
} from "#/modules/org-dashboard/lib/booking-queries";
import {
	BOOKINGS_SEARCH_DEFAULTS,
	type BookingsSearch,
	bookingsSearchSchema,
	calendarStatusesOf,
	listQueryOf,
} from "#/modules/org-dashboard/lib/booking-search";
import { visibleDates } from "#/modules/org-dashboard/lib/calendar";
import {
	availabilityQuery,
	servicesQuery,
} from "#/modules/org-dashboard/lib/service-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { todayIn } from "#/shared/lib/date";
import { cn } from "#/shared/lib/utils";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/bookings/",
)({
	validateSearch: bookingsSearchSchema,
	search: { middlewares: [stripSearchParams(BOOKINGS_SEARCH_DEFAULTS)] },
	component: BookingsPage,
});

function BookingsPage() {
	const { organization, member } = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const availability = useQuery(availabilityQuery(organization.id));
	const services = useQuery(servicesQuery(organization.id));

	const viewToggle = (
		<div className="flex rounded-lg border p-0.5">
			{(
				[
					["calendar", "Calendar", CalendarDaysIcon],
					["list", "List", ListIcon],
				] as const
			).map(([view, label, Icon]) => (
				<Button
					key={view}
					size="sm"
					variant="ghost"
					aria-pressed={search.view === view}
					className={cn(search.view === view && "bg-muted")}
					onClick={() =>
						void navigate({ search: (prev) => ({ ...prev, view }) })
					}
				>
					<Icon />
					{label}
				</Button>
			))}
		</div>
	);

	return (
		<>
			<PageHeader
				title="Bookings"
				description="Every appointment your customers have booked with you."
				action={
					<div className="flex items-center gap-2">
						{hasPermission(member.roles, "bookings:write") && (
							<Button
								nativeButton={false}
								render={
									<Link
										to="/dashboard/$organizationSlug/bookings/new"
										params={{ organizationSlug: organization.slug }}
									/>
								}
							>
								<PlusIcon />
								New booking
							</Button>
						)}
						{viewToggle}
					</div>
				}
			/>
			{availability.isPending ? (
				<Skeleton className="h-[60vh] rounded-xl" />
			) : availability.isError ? (
				<FieldError>{availability.error.message}</FieldError>
			) : (
				<BookingsContent
					search={search}
					availability={availability.data}
					services={services.data ?? []}
				/>
			)}
		</>
	);
}

function BookingsContent({
	search,
	availability,
	services,
}: {
	search: BookingsSearch;
	availability: AvailabilityDto;
	services: ServiceDto[];
}) {
	const { organization, member } = Route.useRouteContext();
	const navigate = Route.useNavigate();
	const router = useRouter();
	const canWrite = hasPermission(member.roles, "bookings:write");
	const { timezone } = availability;
	const today = todayIn(timezone);
	const date = search.date ?? today;
	const dates = visibleDates(search.calendarView, date);
	const isCalendar = search.view === "calendar";

	const calendar = useQuery({
		...bookingCalendarQuery(organization.id, {
			from: dates[0] ?? date,
			to: dates.at(-1) ?? date,
			serviceId: search.serviceId,
			status: calendarStatusesOf(search),
		}),
		enabled: isCalendar,
	});
	const list = useQuery({
		...bookingListQuery(organization.id, listQueryOf(search)),
		enabled: !isCalendar,
	});

	const update = (change: Partial<BookingsSearch>) =>
		void navigate({ search: (prev) => ({ ...prev, ...change }) });

	const zoneLabel = (
		<p className="text-muted-foreground text-xs">Times in {timezone}</p>
	);

	if (isCalendar)
		return (
			<ContentBox className="space-y-2 p-4">
				<BookingsCalendar
					search={search}
					date={date}
					dates={dates}
					today={today}
					bookings={calendar.data}
					loading={calendar.isPending}
					availability={availability}
					services={services}
					organizationSlug={organization.slug}
					onChange={update}
					onPickStart={
						canWrite
							? (start) =>
									void router.navigate({
										href: `/dashboard/${organization.slug}/bookings/new?start=${encodeURIComponent(start.toISOString())}`,
									})
							: undefined
					}
				/>
				{calendar.isError && <FieldError>{calendar.error.message}</FieldError>}
				{zoneLabel}
			</ContentBox>
		);

	return (
		<ContentBox className="space-y-4 p-4">
			<BookingFilters
				search={search}
				services={services}
				onChange={(change) => update({ ...change, page: 1 })}
			/>
			{list.isPending ? (
				<Skeleton className="h-64 rounded-lg" />
			) : list.isError ? (
				<FieldError>{list.error.message}</FieldError>
			) : (
				<BookingsList
					data={list.data}
					timezone={timezone}
					organizationSlug={organization.slug}
					page={search.page}
					onPageChange={(page) => update({ page })}
				/>
			)}
			{zoneLabel}
		</ContentBox>
	);
}
