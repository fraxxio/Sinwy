import type { BookingDetailDto, BookingEventDto } from "@sinwy/shared";
import { formatShortDateIn, formatTimeIn } from "#/shared/lib/date";

const CONTACT_FIELD_LABELS: Record<string, string> = {
	customerName: "name",
	customerEmail: "email",
	customerPhone: "phone",
};

const textOf = (value: unknown) => (typeof value === "string" ? value : null);

const actorOf = (event: BookingEventDto) => {
	if (event.actorType === "customer") return " by the customer";
	if (event.actorType === "system") return "";
	return ` by ${event.actorName ?? "a former team member"}`;
};

function describe(event: BookingEventDto, timezone: string) {
	const when = (iso: string | null) =>
		iso
			? `${formatShortDateIn(iso, timezone)}, ${formatTimeIn(iso, timezone)}`
			: "?";
	const by = actorOf(event);
	switch (event.type) {
		case "created":
			if (event.actorType === "customer")
				return event.toStatus === "pending"
					? "Requested by the customer"
					: "Booked by the customer";
			return `Created${by}`;
		case "rescheduled":
			return `Moved from ${when(textOf(event.payload["previousStartsAt"]))} to ${when(textOf(event.payload["startsAt"]))}${by}`;
		case "contact_updated": {
			const changed = event.payload["fields"];
			const fields = Array.isArray(changed)
				? changed.map(
						(field) => CONTACT_FIELD_LABELS[String(field)] ?? String(field),
					)
				: [];
			return `Contact ${fields.join(", ") || "details"} updated${by}`;
		}
		case "status_changed":
			switch (event.toStatus) {
				case "confirmed":
					return `Confirmed${by}`;
				case "cancelled":
					if (event.payload["accountDeleted"])
						return "Cancelled when the customer deleted their account";
					return event.fromStatus === "pending" && event.actorType === "member"
						? `Declined${by}`
						: `Cancelled${by}`;
				case "completed":
					return event.fromStatus === "no_show"
						? `Changed to completed${by}`
						: `Marked as completed${by}`;
				case "no_show":
					return event.fromStatus === "completed"
						? `Changed to no-show${by}`
						: `Marked as no-show${by}`;
				default:
					return `Status changed${by}`;
			}
	}
}

/** What happened to the booking, oldest first, in the organization's zone. */
export function BookingHistory({
	booking,
	timezone,
}: {
	booking: BookingDetailDto;
	timezone: string;
}) {
	if (booking.history.length === 0)
		return <p className="text-muted-foreground text-sm">No history yet.</p>;

	return (
		<ol className="space-y-4 border-l pl-4">
			{booking.history.map((event) => (
				<li key={event.id} className="relative space-y-0.5">
					<span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
					<p className="text-sm">{describe(event, timezone)}</p>
					{event.toStatus === "cancelled" &&
						event.type === "status_changed" &&
						booking.cancellationReason && (
							<p className="text-muted-foreground text-sm">
								Reason: {booking.cancellationReason}
							</p>
						)}
					<p className="text-muted-foreground text-xs">
						{formatShortDateIn(event.occurredAt, timezone)},{" "}
						{formatTimeIn(event.occurredAt, timezone)}
					</p>
				</li>
			))}
		</ol>
	);
}
