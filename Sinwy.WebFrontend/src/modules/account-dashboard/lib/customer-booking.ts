import {
	ACTIVE_BOOKING_STATUSES,
	type BookingStatus,
	type CustomerBookingDetailDto,
	type CustomerBookingDto,
	type CustomerBookingEventDto,
	customerCanCancel,
	customerCancelDeadline,
} from "@sinwy/shared";
import { formatCancellationWindow } from "#/shared/lib/cancellation-policy";
import { formatShortDateIn, formatTimeIn } from "#/shared/lib/date";

/** Pending or confirmed and not over yet: the Upcoming tab's rule. */
export const isUpcoming = (booking: CustomerBookingDto, now = new Date()) =>
	(ACTIVE_BOOKING_STATUSES as readonly BookingStatus[]).includes(
		booking.status,
	) && Date.parse(booking.endsAt) > now.getTime();

export type CancelPolicy =
	| { canCancel: true; deadline: Date | null }
	/** `windowPassed`: a confirmed booking inside its window, which only the business can cancel now. */
	| { canCancel: false; windowPassed: boolean };

export const cancelPolicyOf = (
	booking: CustomerBookingDto,
	now = new Date(),
): CancelPolicy => {
	if (customerCanCancel(booking, now))
		return { canCancel: true, deadline: customerCancelDeadline(booking) };
	return {
		canCancel: false,
		windowPassed:
			booking.status === "confirmed" &&
			Date.parse(booking.startsAt) > now.getTime(),
	};
};

/** Shown instead of Cancel once the window has passed. */
export const windowPassedMessage = (booking: CustomerBookingDto) => {
	const { name, phone, email } = booking.organization;
	const contacts = [phone, email].filter(Boolean).join(" or ");
	return `Cancellations within ${formatCancellationWindow(booking.cancellationWindowMinutes)} of the start aren't possible online. ${
		contacts ? `Contact ${name} at ${contacts}.` : `Contact ${name}.`
	}`;
};

const lastCancellation = (history: CustomerBookingEventDto[]) =>
	history.findLast(
		(event) =>
			event.type === "status_changed" && event.toStatus === "cancelled",
	);

/** One line under the status badge, or null when the badge says enough. */
export const statusLineOf = (
	booking: CustomerBookingDetailDto,
	now = new Date(),
) => {
	const { name } = booking.organization;
	if (booking.status === "pending")
		return Date.parse(booking.startsAt) <= now.getTime()
			? `${name} didn't answer this request before its start.`
			: `Waiting for ${name} to confirm`;
	if (booking.status !== "cancelled") return null;
	const cancellation = lastCancellation(booking.history);
	const fromPending = cancellation?.fromStatus === "pending";
	if (booking.cancelledBy === "customer")
		return fromPending
			? "You withdrew this request"
			: "You cancelled this booking";
	return fromPending && cancellation?.actor === "organization"
		? `Declined by ${name}`
		: `Cancelled by ${name}`;
};

/** One line of the customer's timeline. */
export function timelineLabelOf(
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
					if (event.fromStatus !== "pending") return `Cancelled${by}`;
					if (event.actor === "customer") return "Request withdrawn by you";
					return event.actor === "organization"
						? `Declined${by}`
						: `Cancelled${by}`;
				case "completed":
					return "Completed";
				case "no_show":
					return "Marked as missed";
				default:
					return `Status changed${by}`;
			}
	}
}
