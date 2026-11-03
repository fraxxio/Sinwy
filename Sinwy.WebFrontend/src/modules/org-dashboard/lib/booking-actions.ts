import { type BookingStatus, canTransition } from "@sinwy/shared";

/** The endpoint under `bookings/:bookingId/` that makes each status change. */
export const STATUS_CHANGE_PATHS = {
	confirmed: "confirm",
	completed: "complete",
	no_show: "no-show",
	cancelled: "cancel",
} as const;

export type StatusChangeTarget = keyof typeof STATUS_CHANGE_PATHS;

export type StatusAction = {
	to: StatusChangeTarget;
	label: string;
	/** Cancelling asks for an optional reason first. */
	needsReason: boolean;
};

type BookingState = { status: BookingStatus; startsAt: string };

const TARGETS = Object.keys(STATUS_CHANGE_PATHS) as StatusChangeTarget[];

const isStarted = (booking: BookingState, now: Date) =>
	now.getTime() >= Date.parse(booking.startsAt);

const labelOf = (
	booking: BookingState,
	to: StatusChangeTarget,
	now: Date,
): string => {
	switch (to) {
		case "confirmed":
			return "Confirm";
		case "completed":
			return booking.status === "confirmed" ? "Complete" : "Mark as completed";
		case "no_show":
			return booking.status === "confirmed" ? "No-show" : "Mark as no-show";
		case "cancelled":
			if (booking.status !== "pending") return "Cancel booking";
			return isStarted(booking, now) ? "Cancel request" : "Decline";
	}
};

/** The status changes staff may make now, in the order the buttons show. */
export const statusActions = (
	booking: BookingState,
	now = new Date(),
): StatusAction[] =>
	TARGETS.filter((to) =>
		canTransition(
			booking.status,
			to,
			"organization",
			new Date(booking.startsAt),
			now,
		),
	).map((to) => ({
		to,
		label: labelOf(booking, to, now),
		needsReason: to === "cancelled",
	}));

/** Staff move pending and confirmed bookings; an expired request can only be cancelled. */
export const canReschedule = (booking: BookingState, now = new Date()) =>
	booking.status === "confirmed" ||
	(booking.status === "pending" && !isStarted(booking, now));
