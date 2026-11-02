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
