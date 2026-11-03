import type { BookingDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { groupByStartDate } from "#/modules/org-dashboard/lib/calendar";
import { BOOKING_STATUS_STYLES } from "#/shared/components/booking/BookingStatusBadge";
import { formatTimeIn } from "#/shared/lib/date";
import { cn } from "#/shared/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHOWN_PER_DAY = 3;

export function MonthView({
	dates,
	month,
	today,
	bookings,
	timezone,
	organizationSlug,
	onShowDay,
}: {
	dates: string[];
	/** "YYYY-MM" of the month shown; other dates are muted. */
	month: string;
	today: string;
	bookings: BookingDto[];
	timezone: string;
	organizationSlug: string;
	onShowDay: (date: string) => void;
}) {
	const byDate = groupByStartDate(bookings, timezone);
	return (
		<div className="overflow-hidden rounded-lg border">
			<div className="grid grid-cols-7 border-b bg-muted/40 text-muted-foreground text-xs">
				{WEEKDAYS.map((day) => (
					<div key={day} className="px-2 py-1.5 font-medium">
						{day}
					</div>
				))}
			</div>
			<div className="grid grid-cols-7">
				{dates.map((date, index) => {
					const day = byDate.get(date) ?? [];
					const hidden = day.length - SHOWN_PER_DAY;
					return (
						<div
							key={date}
							data-date={date}
							className={cn(
								"min-h-28 space-y-1 border-b p-1.5",
								index % 7 !== 6 && "border-r",
								!date.startsWith(month) && "bg-muted/30 text-muted-foreground",
							)}
						>
							<button
								type="button"
								onClick={() => onShowDay(date)}
								aria-label={`Show ${date}`}
								className={cn(
									"flex size-6 items-center justify-center rounded-full text-xs tabular-nums hover:bg-muted",
									date === today &&
										"bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
								)}
							>
								{Number(date.slice(8))}
							</button>
							{day.slice(0, SHOWN_PER_DAY).map((booking) => (
								<Link
									key={booking.id}
									to="/dashboard/$organizationSlug/bookings/$id"
									params={{ organizationSlug, id: booking.id }}
									className={cn(
										"block truncate rounded border px-1.5 py-0.5 text-xs",
										BOOKING_STATUS_STYLES[booking.status],
									)}
								>
									<span className="tabular-nums">
										{formatTimeIn(booking.startsAt, timezone)}
									</span>{" "}
									{booking.customerName}
								</Link>
							))}
							{hidden > 0 && (
								<button
									type="button"
									onClick={() => onShowDay(date)}
									className="px-1.5 text-muted-foreground text-xs hover:text-foreground hover:underline"
								>
									+{hidden} more
								</button>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
