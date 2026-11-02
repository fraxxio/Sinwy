import { expect, test } from "bun:test";
import {
	BOOKING_ACTORS,
	BOOKING_STATUSES,
	type BookingActor,
	type BookingStatus,
	canTransition,
} from "@sinwy/shared";

const startsAt = new Date("2026-11-03T10:00:00Z");
const before = new Date("2026-11-03T09:59:59Z");
const after = new Date("2026-11-03T10:00:00Z");

type Row = [BookingStatus, BookingStatus, BookingActor, "before" | "after"];

/** Every allowed (from, to, actor, time) combination; anything not listed is refused. */
const allowed: Row[] = [
	["pending", "confirmed", "organization", "before"],
	["pending", "cancelled", "organization", "before"],
	["pending", "cancelled", "organization", "after"],
	["pending", "cancelled", "customer", "before"],
	["pending", "cancelled", "customer", "after"],
	["confirmed", "cancelled", "organization", "before"],
	["confirmed", "cancelled", "organization", "after"],
	["confirmed", "cancelled", "customer", "before"],
	["confirmed", "completed", "organization", "after"],
	["confirmed", "no_show", "organization", "after"],
	["completed", "no_show", "organization", "before"],
	["completed", "no_show", "organization", "after"],
	["no_show", "completed", "organization", "before"],
	["no_show", "completed", "organization", "after"],
];

const key = (row: Row) => row.join(" ");
const allowedKeys = new Set(allowed.map(key));

const everyCombination = BOOKING_STATUSES.flatMap((from) =>
	BOOKING_STATUSES.flatMap((to) =>
		BOOKING_ACTORS.flatMap((actor) =>
			(["before", "after"] as const).map(
				(time): Row => [from, to, actor, time],
			),
		),
	),
);

test.each(
	everyCombination,
)("%s → %s by %s %s start", (from, to, actor, time) => {
	const now = time === "before" ? before : after;
	expect(canTransition(from, to, actor, startsAt, now)).toBe(
		allowedKeys.has(key([from, to, actor, time])),
	);
});

test("the start instant itself counts as started", () => {
	expect(
		canTransition("pending", "confirmed", "organization", startsAt, startsAt),
	).toBe(false);
	expect(
		canTransition("confirmed", "completed", "organization", startsAt, startsAt),
	).toBe(true);
	expect(
		canTransition("confirmed", "cancelled", "customer", startsAt, startsAt),
	).toBe(false);
});
