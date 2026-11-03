import type {
	CustomerBookingDetailDto,
	CustomerBookingEventDto,
} from "@sinwy/shared";
import { formatShortDateIn, formatTimeIn } from "#/shared/lib/date";

function describe(
	event: CustomerBookingEventDto,
	organizationName: string,
	timezone: string,
) {
	const when = (iso: string) =>
		`${formatShortDateIn(iso, timezone)}, ${formatTimeIn(iso, timezone)}`;
	const by =
		event.actor === "customer"
			? " by you"
			: event.actor === "organization"
				? ` by ${organizationName}`
				: "";
	switch (event.type) {
		case "created":
			if (event.actor === "customer")
				return event.toStatus === "pending"
					? "Requested by you"
					: "Booked by you";
			return `Booked${by}`;
		case "rescheduled":
			return event.moved
				? `Moved from ${when(event.moved.from)} to ${when(event.moved.to)}${by}`
				: `Moved${by}`;
		case "status_changed":
			switch (event.toStatus) {
				case "confirmed":
					return `Confirmed${by}`;
				case "cancelled":
					if (event.fromStatus === "pending")
						return event.actor === "customer"
							? "Request withdrawn by you"
							: `Declined${by}`;
					return `Cancelled${by}`;
				case "completed":
					return "Completed";
				case "no_show":
					return "Marked as missed";
				default:
					return `Status changed${by}`;
			}
	}
}

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
					<p className="text-sm">{describe(event, name, timezone)}</p>
					<p className="text-muted-foreground text-xs">
						{formatShortDateIn(event.occurredAt, timezone)},{" "}
						{formatTimeIn(event.occurredAt, timezone)}
					</p>
				</li>
			))}
		</ol>
	);
}
