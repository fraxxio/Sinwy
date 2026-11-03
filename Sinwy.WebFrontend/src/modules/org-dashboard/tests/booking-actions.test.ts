import { describe, expect, it } from "bun:test";
import {
	BOOKING_STATUSES,
	type BookingStatus,
	canTransition,
} from "@sinwy/shared";
import {
	canReschedule,
	STATUS_CHANGE_PATHS,
	statusActions,
} from "#/modules/org-dashboard/lib/booking-actions";

const NOW = new Date("2026-11-04T12:00:00Z");
const BEFORE_START = "2026-11-04T13:00:00Z";
const AFTER_START = "2026-11-04T11:00:00Z";

const labels = (status: BookingStatus, startsAt: string) =>
	statusActions({ status, startsAt }, NOW).map(({ label }) => label);

describe("statusActions", () => {
	it("offers exactly the changes canTransition allows staff, for every status and time", () => {
		for (const status of BOOKING_STATUSES)
			for (const startsAt of [BEFORE_START, AFTER_START, NOW.toISOString()]) {
				const allowed = (
					Object.keys(STATUS_CHANGE_PATHS) as BookingStatus[]
				).filter((to) =>
					canTransition(status, to, "organization", new Date(startsAt), NOW),
				);
				const offered = statusActions({ status, startsAt }, NOW).map(
					({ to }) => to,
				);
				expect({ status, startsAt, offered }).toEqual({
					status,
					startsAt,
					offered: allowed as typeof offered,
				});
			}
	});

	it("names each button for what it does to that booking", () => {
		expect(labels("pending", BEFORE_START)).toEqual(["Confirm", "Decline"]);
		expect(labels("pending", AFTER_START)).toEqual(["Cancel request"]);
		expect(labels("confirmed", BEFORE_START)).toEqual(["Cancel booking"]);
		expect(labels("confirmed", AFTER_START)).toEqual([
			"Complete",
			"No-show",
			"Cancel booking",
		]);
		expect(labels("completed", AFTER_START)).toEqual(["Mark as no-show"]);
		expect(labels("no_show", AFTER_START)).toEqual(["Mark as completed"]);
		expect(labels("cancelled", BEFORE_START)).toEqual([]);
		expect(labels("cancelled", AFTER_START)).toEqual([]);
	});

	it("asks for a reason only when cancelling", () => {
		const actions = statusActions(
			{ status: "pending", startsAt: BEFORE_START },
			NOW,
		);
		expect(actions.map(({ to, needsReason }) => [to, needsReason])).toEqual([
			["confirmed", false],
			["cancelled", true],
		]);
	});
});

describe("canReschedule", () => {
	it("moves pending and confirmed bookings, but not an expired request or a finished one", () => {
		const can = (status: BookingStatus, startsAt: string) =>
			canReschedule({ status, startsAt }, NOW);
		expect(can("pending", BEFORE_START)).toBe(true);
		expect(can("pending", AFTER_START)).toBe(false);
		expect(can("confirmed", BEFORE_START)).toBe(true);
		expect(can("confirmed", AFTER_START)).toBe(true);
		expect(can("completed", AFTER_START)).toBe(false);
		expect(can("no_show", AFTER_START)).toBe(false);
		expect(can("cancelled", BEFORE_START)).toBe(false);
	});
});
