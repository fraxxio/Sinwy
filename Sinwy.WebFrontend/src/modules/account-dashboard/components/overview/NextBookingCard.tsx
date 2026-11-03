import type { CustomerBookingDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { AddToCalendarButton } from "#/modules/account-dashboard/components/bookings/AddToCalendarButton";
import { BookingStatusBadge } from "#/shared/components/booking/BookingStatusBadge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { formatDateIn, formatTimeIn } from "#/shared/lib/date";

export function NextBookingCard({ booking }: { booking: CustomerBookingDto }) {
	const { timezone } = booking.organization;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Next booking</CardTitle>
				<CardDescription>Times in {timezone}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-1">
					<Link
						to="/account/bookings/$id"
						params={{ id: booking.id }}
						className="font-medium underline-offset-4 hover:underline"
					>
						{booking.serviceName} at {booking.organization.name}
					</Link>
					<p className="text-sm">
						{formatDateIn(booking.startsAt, timezone)},{" "}
						{formatTimeIn(booking.startsAt, timezone)}–
						{formatTimeIn(booking.endsAt, timezone)}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<BookingStatusBadge booking={booking} />
					<AddToCalendarButton booking={booking} />
				</div>
			</CardContent>
		</Card>
	);
}
