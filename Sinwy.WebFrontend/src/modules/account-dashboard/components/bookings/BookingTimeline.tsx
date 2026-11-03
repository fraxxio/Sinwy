import type { CustomerBookingDetailDto } from "@sinwy/shared";
import { timelineLabelOf } from "#/modules/account-dashboard/lib/customer-booking";
import { formatShortDateIn, formatTimeIn } from "#/shared/lib/date";

/** What happened to the booking, oldest first, in the organization's zone. */
export function BookingTimeline({
	booking,
}: {
	booking: CustomerBookingDetailDto;
}) {
	const { name, timezone } = booking.organization;
	if (booking.history.length === 0)
		return <p className="text-muted-foreground text-sm">No history yet.</p>;

	return (
		<ol className="space-y-4 border-l pl-4">
			{booking.history.map((event) => (
				<li key={event.id} className="relative space-y-0.5">
					<span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
					<p className="text-sm">{timelineLabelOf(event, name, timezone)}</p>
					<p className="text-muted-foreground text-xs">
						{formatShortDateIn(event.occurredAt, timezone)},{" "}
						{formatTimeIn(event.occurredAt, timezone)}
					</p>
				</li>
			))}
		</ol>
	);
}
