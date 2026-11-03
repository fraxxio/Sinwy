export const BOOKING_STATUSES = [
	"pending",
	"confirmed",
	"cancelled",
	"completed",
	"no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** The statuses that hold the organization's time. */
export const ACTIVE_BOOKING_STATUSES = [
	"pending",
	"confirmed",
] as const satisfies readonly BookingStatus[];

/** Who asked for a change: the organization's staff or the customer who booked. */
export const BOOKING_ACTORS = ["organization", "customer"] as const;
export type BookingActor = (typeof BOOKING_ACTORS)[number];

export type BookingTransition = {
	from: BookingStatus;
	to: BookingStatus;
	actors: readonly BookingActor[];
	/** Measured against the booking's start; "any" ignores the time. */
	timing: "beforeStart" | "afterStart" | "any";
};

/** The only legal status changes. `cancelled` is final, so it never appears as `from`. */
export const BOOKING_TRANSITIONS: readonly BookingTransition[] = [
	{
		from: "pending",
		to: "confirmed",
		actors: ["organization"],
		timing: "beforeStart",
	},
	{
		from: "pending",
		to: "cancelled",
		actors: ["organization", "customer"],
		timing: "any",
	},
	{
		from: "confirmed",
		to: "cancelled",
		actors: ["organization"],
		timing: "any",
	},
	{
		from: "confirmed",
		to: "cancelled",
		actors: ["customer"],
		timing: "beforeStart",
	},
	{
		from: "confirmed",
		to: "completed",
		actors: ["organization"],
		timing: "afterStart",
	},
	{
		from: "confirmed",
		to: "no_show",
		actors: ["organization"],
		timing: "afterStart",
	},
	{
		from: "completed",
		to: "no_show",
		actors: ["organization"],
		timing: "any",
	},
	{
		from: "no_show",
		to: "completed",
		actors: ["organization"],
		timing: "any",
	},
];

export const canTransition = (
	from: BookingStatus,
	to: BookingStatus,
	actor: BookingActor,
	startsAt: Date,
	now: Date = new Date(),
) => {
	const started = now.getTime() >= startsAt.getTime();
	return BOOKING_TRANSITIONS.some(
		(transition) =>
			transition.from === from &&
			transition.to === to &&
			transition.actors.includes(actor) &&
			(transition.timing === "any" ||
				(transition.timing === "afterStart") === started),
	);
};

type CustomerCancellable = {
	status: BookingStatus;
	startsAt: string | Date;
	cancellationWindowMinutes: number;
};

/** The last instant a customer may cancel online, or null when only the start limits it. */
export const customerCancelDeadline = (booking: CustomerCancellable) => {
	if (booking.status !== "confirmed" || booking.cancellationWindowMinutes === 0)
		return null;
	return new Date(
		new Date(booking.startsAt).getTime() -
			booking.cancellationWindowMinutes * 60_000,
	);
};

/** Customer cancels follow the transition table, and a confirmed booking also its cancellation window. */
export const customerCanCancel = (
	booking: CustomerCancellable,
	now: Date = new Date(),
) => {
	const startsAt = new Date(booking.startsAt);
	if (!canTransition(booking.status, "cancelled", "customer", startsAt, now))
		return false;
	const deadline = customerCancelDeadline(booking);
	return deadline === null || now.getTime() < deadline.getTime();
};
