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
	const fromPending =
		lastCancellation(booking.history)?.fromStatus === "pending";
	if (booking.cancelledBy === "customer")
		return fromPending
			? "You withdrew this request"
			: "You cancelled this booking";
	return fromPending ? `Declined by ${name}` : `Cancelled by ${name}`;
};
