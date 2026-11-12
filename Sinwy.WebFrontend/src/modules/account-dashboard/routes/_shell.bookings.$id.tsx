import type { CustomerBookingDetailDto } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarXIcon, RepeatIcon } from "lucide-react";
import { AddToCalendarButton } from "#/modules/account-dashboard/components/bookings/AddToCalendarButton";
import { BookingTimeline } from "#/modules/account-dashboard/components/bookings/BookingTimeline";
import { CancelBookingButton } from "#/modules/account-dashboard/components/bookings/CancelBookingButton";
import { accountBookingQuery } from "#/modules/account-dashboard/lib/booking-queries";
import {
	cancelPolicyOf,
	isUpcoming,
	statusLineOf,
	windowPassedMessage,
} from "#/modules/account-dashboard/lib/customer-booking";
import { BookingStatusBadge } from "#/shared/components/booking/BookingStatusBadge";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { FlatCard } from "#/shared/components/FlatCard";
import { PageHeader } from "#/shared/components/PageHeader";
import { Button } from "#/shared/components/ui/button";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { formatDateIn, formatTimeIn } from "#/shared/lib/date";
import { formatMinorUnits } from "#/shared/lib/money";

export const Route = createFileRoute("/account/_shell/bookings/$id")({
	staticData: { crumb: "Booking" },
	component: BookingDetailPage,
});

function BookingDetailPage() {
	const { id } = Route.useParams();
	const booking = useQuery(accountBookingQuery(id));

	if (booking.isError)
		return (
			<>
				<PageHeader title="Booking" />
				<ContentBox>
					<FieldError>{booking.error.message}</FieldError>
				</ContentBox>
			</>
		);
	if (booking.isPending)
		return (
			<>
				<PageHeader title="Booking" description="Loading your booking…" />
				<ContentBox className="gap-4">
					<Skeleton className="h-40 rounded-md" />
					<div className="grid gap-4 lg:grid-cols-2">
						<Skeleton className="h-56 rounded-md" />
						<Skeleton className="h-56 rounded-md" />
					</div>
					<Skeleton className="h-40 rounded-md" />
				</ContentBox>
			</>
		);
	if (booking.data === null)
		return (
			<>
				<PageHeader title="Booking" />
				<ContentBox>
					<EmptyState
						icon={<CalendarXIcon />}
						title="Booking not found"
						description="It may have been made from another account."
						className="border-none"
						action={
							<Button
								variant="outline"
								nativeButton={false}
								render={<Link to="/account/bookings" />}
							>
								Back to bookings
							</Button>
						}
					/>
				</ContentBox>
			</>
		);

	return <BookingDetail booking={booking.data} />;
}

function BookingDetail({ booking }: { booking: CustomerBookingDetailDto }) {
	const { organization } = booking;
	const { timezone } = organization;
	const now = new Date();
	const policy = cancelPolicyOf(booking, now);
	const statusLine = statusLineOf(booking, now);
	const location = [organization.city, organization.country]
		.filter(Boolean)
		.join(", ");
	const at = (iso: string) =>
		`${formatDateIn(iso, timezone)}, ${formatTimeIn(iso, timezone)}`;

	return (
		<>
			<PageHeader
				title={booking.serviceName}
				description={`at ${organization.name}`}
			/>
			<ContentBox className="gap-4">
				<FlatCard>
					<CardContent className="space-y-4">
						<div className="space-y-1">
							<div className="flex flex-wrap items-center gap-3">
								<BookingStatusBadge booking={booking} />
								<p className="font-medium">
									{formatDateIn(booking.startsAt, timezone)},{" "}
									{formatTimeIn(booking.startsAt, timezone)}–
									{formatTimeIn(booking.endsAt, timezone)}
								</p>
							</div>
							{statusLine && (
								<p className="text-muted-foreground text-sm">{statusLine}</p>
							)}
							{booking.cancellationReason && (
								<p className="text-muted-foreground text-sm">
									Reason: {booking.cancellationReason}
								</p>
							)}
						</div>
						{policy.canCancel && policy.deadline && (
							<p className="text-sm">
								You can cancel until {at(policy.deadline.toISOString())} (
								{timezone}).
							</p>
						)}
						{policy.canCancel && !policy.deadline && (
							<p className="text-sm">
								{booking.status === "pending"
									? "You can withdraw this request any time."
									: "You can cancel any time before the start."}
							</p>
						)}
						{!policy.canCancel && policy.windowPassed && (
							<p className="text-sm">{windowPassedMessage(booking)}</p>
						)}
						<div className="flex flex-wrap gap-2">
							{policy.canCancel && <CancelBookingButton booking={booking} />}
							{isUpcoming(booking, now) && (
								<AddToCalendarButton booking={booking} />
							)}
							<Button
								variant="outline"
								nativeButton={false}
								render={
									<Link
										to="/$organizationSlug/book"
										params={{ organizationSlug: organization.slug }}
										search={{ service: booking.serviceId }}
									/>
								}
							>
								<RepeatIcon />
								Book again
							</Button>
						</div>
					</CardContent>
				</FlatCard>
				<div className="grid gap-4 lg:grid-cols-2">
					<FlatCard>
						<CardHeader>
							<CardTitle>Appointment</CardTitle>
							<CardDescription>Times in {timezone}</CardDescription>
						</CardHeader>
						<CardContent>
							<dl className="grid gap-2 text-sm sm:grid-cols-[6rem_1fr]">
								<dt className="text-muted-foreground">Service</dt>
								<dd>{booking.serviceName}</dd>
								<dt className="text-muted-foreground">When</dt>
								<dd>
									{formatDateIn(booking.startsAt, timezone)},{" "}
									{formatTimeIn(booking.startsAt, timezone)}–
									{formatTimeIn(booking.endsAt, timezone)}
								</dd>
								<dt className="text-muted-foreground">Price</dt>
								<dd>
									{formatMinorUnits(booking.priceMinor, booking.currency)}
								</dd>
								<dt className="text-muted-foreground">Booked</dt>
								<dd>{at(booking.createdAt)}</dd>
								<dt className="text-muted-foreground">Your note</dt>
								<dd className="whitespace-pre-wrap">
									{booking.customerNote ?? "No note."}
								</dd>
							</dl>
						</CardContent>
					</FlatCard>
					<FlatCard>
						<CardHeader>
							<CardTitle>Business</CardTitle>
						</CardHeader>
						<CardContent>
							<dl className="grid gap-2 text-sm sm:grid-cols-[6rem_1fr]">
								<dt className="text-muted-foreground">Name</dt>
								<dd>
									<Link
										to="/$organizationSlug"
										params={{ organizationSlug: organization.slug }}
										className="underline underline-offset-4"
									>
										{organization.name}
									</Link>
								</dd>
								{location && (
									<>
										<dt className="text-muted-foreground">Location</dt>
										<dd>{location}</dd>
									</>
								)}
								{organization.phone && (
									<>
										<dt className="text-muted-foreground">Phone</dt>
										<dd>
											<a
												href={`tel:${organization.phone}`}
												className="underline underline-offset-4"
											>
												{organization.phone}
											</a>
										</dd>
									</>
								)}
								{organization.email && (
									<>
										<dt className="text-muted-foreground">Email</dt>
										<dd>
											<a
												href={`mailto:${organization.email}`}
												className="underline underline-offset-4"
											>
												{organization.email}
											</a>
										</dd>
									</>
								)}
							</dl>
						</CardContent>
					</FlatCard>
				</div>
				<FlatCard>
					<CardHeader>
						<CardTitle>Timeline</CardTitle>
					</CardHeader>
					<CardContent>
						<BookingTimeline booking={booking} />
					</CardContent>
				</FlatCard>
			</ContentBox>
		</>
	);
}
