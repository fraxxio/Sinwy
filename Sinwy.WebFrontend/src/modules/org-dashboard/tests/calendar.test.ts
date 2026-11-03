import { describe, expect, it } from "bun:test";
import {
	bookingSpan,
	closedSpans,
	dayColumn,
	firstOpeningPosition,
	gridRows,
	groupByStartDate,
	instantAt,
	rangeTitle,
	shiftDate,
	visibleDates,
} from "#/modules/org-dashboard/lib/calendar";

const VILNIUS = "Europe/Vilnius";
const at = (iso: string) => ({ startsAt: iso, endsAt: iso });
const booking = (startsAt: string, endsAt: string) => ({ startsAt, endsAt });

describe("visibleDates", () => {
	it("starts a week on Monday", () => {
		// Sunday 8 November 2026
		const week = visibleDates("week", "2026-11-08");
		expect(week[0]).toBe("2026-11-02");
		expect(week.at(-1)).toBe("2026-11-08");
		expect(week).toHaveLength(7);
	});

	it("covers a month in whole weeks from Monday", () => {
		const month = visibleDates("month", "2026-11-15");
		expect(month[0]).toBe("2026-10-26");
		expect(month.at(-1)).toBe("2026-12-06");
		expect(month.length % 7).toBe(0);
		expect(month.length).toBeLessThanOrEqual(42);
	});

	it("shows a single date in the day view", () => {
		expect(visibleDates("day", "2026-11-04")).toEqual(["2026-11-04"]);
	});
});

it("steps by a day, a week or a month", () => {
	expect(shiftDate("day", "2026-12-31", 1)).toBe("2027-01-01");
	expect(shiftDate("week", "2026-11-04", -1)).toBe("2026-10-28");
	expect(shiftDate("month", "2026-01-31", 1)).toBe("2026-02-28");
});

describe("time grid", () => {
	it("gives a normal date 24 hours from local midnight", () => {
		const column = dayColumn("2026-11-04", VILNIUS);
		expect(column.slots).toHaveLength(24);
		expect(new Date(column.start).toISOString()).toBe(
			"2026-11-03T22:00:00.000Z",
		);
	});

	it("places a booking by the org's wall clock", () => {
		const column = dayColumn("2026-11-04", VILNIUS);
		const rows = gridRows([column]);
		expect(
			bookingSpan(
				booking("2026-11-04T08:00:00Z", "2026-11-04T08:30:00Z"),
				column,
				rows,
			),
		).toEqual({ top: 600, height: 30 });
	});

	it("gives the spring-forward date 23 hours and keeps later blocks on their wall time", () => {
		const column = dayColumn("2026-03-29", VILNIUS);
		expect(column.slots).toHaveLength(23);
		const rows = gridRows([column]);
		expect(rows).toHaveLength(23);
		// 10:00 EEST is 07:00Z
		const span = bookingSpan(
			booking("2026-03-29T07:00:00Z", "2026-03-29T07:30:00Z"),
			column,
			rows,
		);
		expect(rows[(span?.top ?? 0) / 60]?.label).toBe("10:00");
	});

	it("gives the fall-back date 25 hours, with the repeated hour twice", () => {
		const column = dayColumn("2026-10-25", VILNIUS);
		expect(column.slots).toHaveLength(25);
		const rows = gridRows([column]);
		expect(rows.map(({ label }) => label).filter((l) => l === "03:00")).toEqual(
			["03:00", "03:00"],
		);
		// 10:00 EET is 08:00Z
		const span = bookingSpan(
			booking("2026-10-25T08:00:00Z", "2026-10-25T09:00:00Z"),
			column,
			rows,
		);
		expect(rows[(span?.top ?? 0) / 60]?.label).toBe("10:00");
		expect(span?.height).toBe(60);
	});

	it("keeps a 10:00 booking on the same row across a week with a DST change", () => {
		const columns = visibleDates("week", "2026-10-25").map((date) =>
			dayColumn(date, VILNIUS),
		);
		const rows = gridRows(columns);
		expect(rows).toHaveLength(25);
		// Monday 10:00 EEST and Sunday 10:00 EET
		const monday = bookingSpan(
			at("2026-10-19T07:00:00Z"),
			columns[0] as never,
			rows,
		);
		const sunday = bookingSpan(
			at("2026-10-25T08:00:00Z"),
			columns[6] as never,
			rows,
		);
		expect(monday?.top).toBe(sunday?.top as number);
	});

	it("shades the hour a date doesn't have in a week grid", () => {
		const columns = visibleDates("week", "2026-03-29").map((date) =>
			dayColumn(date, VILNIUS),
		);
		const rows = gridRows(columns);
		expect(rows).toHaveLength(24);
		const weekly = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
			weekday,
			start: "00:00",
			end: "23:45",
		}));
		const sundaySpans = closedSpans(columns[6] as never, rows, weekly, []);
		expect(sundaySpans).toContainEqual({ top: 3 * 60, height: 60 });
		const mondaySpans = closedSpans(columns[0] as never, rows, weekly, []);
		expect(mondaySpans).not.toContainEqual({ top: 3 * 60, height: 60 });
	});

	it("splits a booking across local midnight between the two dates", () => {
		const first = dayColumn("2026-11-04", VILNIUS);
		const second = dayColumn("2026-11-05", VILNIUS);
		const rows = gridRows([first, second]);
		// 23:30–00:30 local
		const late = booking("2026-11-04T21:30:00Z", "2026-11-04T22:30:00Z");
		expect(bookingSpan(late, first, rows)).toEqual({ top: 1410, height: 30 });
		expect(bookingSpan(late, second, rows)).toEqual({ top: 0, height: 30 });
		expect(groupByStartDate([late], VILNIUS).get("2026-11-04")).toHaveLength(1);
		expect(groupByStartDate([late], VILNIUS).has("2026-11-05")).toBe(false);
	});

	it("leaves out a booking on another date", () => {
		const column = dayColumn("2026-11-04", VILNIUS);
		expect(
			bookingSpan(
				booking("2026-11-05T08:00:00Z", "2026-11-05T08:30:00Z"),
				column,
				gridRows([column]),
			),
		).toBeNull();
	});
});

describe("business hours", () => {
	const column = dayColumn("2026-11-04", VILNIUS); // Wednesday
	const rows = gridRows([column]);
	const weekly = [{ weekday: 3, start: "09:00", end: "17:30" }];

	it("shades before opening and after closing", () => {
		expect(closedSpans(column, rows, weekly, [])).toEqual([
			{ top: 0, height: 540 },
			{ top: 1050, height: 390 },
		]);
	});

	it("shades the whole day on a closure or a day without hours", () => {
		const whole = [{ top: 0, height: 1440 }];
		expect(closedSpans(column, rows, weekly, [{ date: "2026-11-04" }])).toEqual(
			whole,
		);
		expect(closedSpans(column, rows, [], [])).toEqual(whole);
	});

	it("scrolls to the earliest opening time", () => {
		expect(
			firstOpeningPosition(
				[...weekly, { weekday: 6, start: "07:15", end: "12:00" }],
				rows,
			),
		).toBe(435);
	});
});

it("groups bookings by the local date they start on, in time order", () => {
	const grouped = groupByStartDate(
		[at("2026-11-04T12:00:00Z"), at("2026-11-04T08:00:00Z")],
		"America/New_York",
	);
	expect(grouped.get("2026-11-04")?.map(({ startsAt }) => startsAt)).toEqual([
		"2026-11-04T08:00:00Z",
		"2026-11-04T12:00:00Z",
	]);
});

describe("instantAt", () => {
	it("turns a click on the grid into a start on the org's wall clock", () => {
		const column = dayColumn("2026-11-04", VILNIUS);
		const rows = gridRows([column]);
		// 15:07 local snaps to 15:00, which is 13:00Z
		expect(instantAt(15 * 60 + 7, column, rows)?.toISOString()).toBe(
			"2026-11-04T13:00:00.000Z",
		);
	});

	it("tells the two passes of a repeated hour apart, and has nothing in a skipped one", () => {
		const fallBack = dayColumn("2026-10-25", VILNIUS);
		const fallRows = gridRows([fallBack]);
		expect(instantAt(3 * 60 + 30, fallBack, fallRows)?.toISOString()).toBe(
			"2026-10-25T00:30:00.000Z",
		);
		expect(instantAt(4 * 60 + 30, fallBack, fallRows)?.toISOString()).toBe(
			"2026-10-25T01:30:00.000Z",
		);
		const week = visibleDates("week", "2026-03-29").map((date) =>
			dayColumn(date, VILNIUS),
		);
		expect(instantAt(3 * 60, week[6] as never, gridRows(week))).toBeNull();
	});
});

it("titles each view", () => {
	expect(rangeTitle("month", "2026-11-04")).toBe("November 2026");
	expect(rangeTitle("week", "2026-11-04")).toBe("2 – 8 November 2026");
	expect(rangeTitle("week", "2026-10-28")).toBe("26 October – 1 November 2026");
	expect(rangeTitle("day", "2026-11-04")).toBe("Wednesday, 4 November 2026");
});
