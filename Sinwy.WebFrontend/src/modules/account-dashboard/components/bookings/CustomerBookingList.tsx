import type { CustomerBookingDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { BookingStatusBadge } from "#/shared/components/booking/BookingStatusBadge";
import { formatShortDateIn, formatTimeIn } from "#/shared/lib/date";
import { formatMinorUnits } from "#/shared/lib/money";
import { cn } from "#/shared/lib/utils";

/** Each row in its own organization's zone, with the zone named. */
export function CustomerBookingList({
	bookings,
}: {
	bookings: CustomerBookingDto[];
}) {
	return (
		<ul className="divide-y rounded-xl border">
			{bookings.map((booking) => {
				const { timezone } = booking.organization;
				return (
					<li
						key={booking.id}
						className={cn(
							"relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 hover:bg-muted/50",
							booking.status === "cancelled" && "text-muted-foreground",
						)}
					>
						<div className="space-y-0.5">
							<Link
								to="/account/bookings/$id"
								params={{ id: booking.id }}
								className="font-medium after:absolute after:inset-0"
							>
								{booking.serviceName} at {booking.organization.name}
							</Link>
							<p className="text-muted-foreground text-sm">
								{formatShortDateIn(booking.startsAt, timezone)},{" "}
								{formatTimeIn(booking.startsAt, timezone)}–
								{formatTimeIn(booking.endsAt, timezone)}{" "}
								<span className="text-xs">({timezone})</span>
							</p>
						</div>
						<div className="flex items-center gap-3">
							<span className="text-sm tabular-nums">
								{formatMinorUnits(booking.priceMinor, booking.currency)}
							</span>
							<BookingStatusBadge booking={booking} />
						</div>
					</li>
				);
			})}
		</ul>
	);
}
