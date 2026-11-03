import type { BookingDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { BookingStatusBadge } from "#/modules/org-dashboard/components/bookings/BookingStatusBadge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { formatTimeIn } from "#/shared/lib/date";

export function TodayBookings({
	organizationSlug,
	bookings,
	timezone,
}: {
	organizationSlug: string;
	bookings: BookingDto[];
	timezone: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Today's bookings</CardTitle>
				<CardDescription>Times in {timezone}</CardDescription>
			</CardHeader>
			<CardContent>
				{bookings.length === 0 ? (
					<p className="text-muted-foreground text-sm">No bookings today.</p>
				) : (
					<ul className="divide-y">
						{bookings.map((booking) => (
							<li key={booking.id}>
								<Link
									to="/dashboard/$organizationSlug/bookings/$id"
									params={{ organizationSlug, id: booking.id }}
									className="flex items-center gap-4 rounded-md py-2 hover:bg-muted/50"
								>
									<span className="w-24 shrink-0 text-sm tabular-nums">
										{formatTimeIn(booking.startsAt, timezone)}–
										{formatTimeIn(booking.endsAt, timezone)}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium text-sm">
											{booking.customerName}
										</span>
										<span className="block truncate text-muted-foreground text-xs">
											{booking.serviceName}
										</span>
									</span>
									<BookingStatusBadge booking={booking} />
								</Link>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
