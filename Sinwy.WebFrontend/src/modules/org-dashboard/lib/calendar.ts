import { tzOffset } from "@date-fns/tz";
import type { ClosureDto, WeeklyRangeDto } from "@sinwy/shared";
import {
	addMonths,
	endOfMonth,
	format,
	getISODay,
	parseISO,
	startOfMonth,
} from "date-fns";
import { addDaysToDate, formatTimeIn, localDateOf } from "#/shared/lib/date";

export const CALENDAR_VIEWS = ["month", "week", "day"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The Monday of the ISO week holding a local date. */
export const isoWeekStart = (date: string) =>
	addDaysToDate(date, 1 - getISODay(parseISO(date)));

const datesFrom = (start: string, count: number) =>
	Array.from({ length: count }, (_, index) => addDaysToDate(start, index));

/**
 * The local dates a view shows, Monday first. A month shows whole weeks, so its
 * grid starts before the 1st and ends after the last day (at most 42 dates).
 */
export function visibleDates(view: CalendarView, date: string) {
	if (view === "day") return [date];
	if (view === "week") return datesFrom(isoWeekStart(date), 7);
	const first = format(startOfMonth(parseISO(date)), "yyyy-MM-dd");
	const last = format(endOfMonth(parseISO(date)), "yyyy-MM-dd");
	const start = isoWeekStart(first);
	const end = addDaysToDate(isoWeekStart(last), 6);
	const days = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1;
	return datesFrom(start, days);
}

/** The date one view step away: a day, a week or a month. */
export function shiftDate(view: CalendarView, date: string, step: 1 | -1) {
	if (view === "day") return addDaysToDate(date, step);
	if (view === "week") return addDaysToDate(date, 7 * step);
	return format(addMonths(parseISO(date), step), "yyyy-MM-dd");
}

/**
 * The instant a wall-clock time ("HH:mm") on a local date reads in `timezone`.
 * A time the clocks skip moves forward past the jump; a repeated one takes its first pass.
 */
export function instantOfWallTime(
	date: string,
	time: string,
	timezone: string,
) {
	const wall = Date.parse(`${date}T${time}Z`);
	const offsetAt = (instant: number) =>
		tzOffset(timezone, new Date(instant)) * MINUTE_MS;
	const instants = [wall - DAY_MS, wall + DAY_MS].map(
		(time) => wall - offsetAt(time),
	);
	const matching = instants.filter(
		(instant) => instant + offsetAt(instant) === wall,
	);
	return matching.length > 0 ? Math.min(...matching) : Math.max(...instants);
}

/** The first instant of a local date; a midnight DST skip starts the day when the clocks jump. */
export const startOfLocalDate = (date: string, timezone: string) =>
	instantOfWallTime(date, "00:00", timezone);

type HourSlot = { key: string; start: number };

/** One date of a time grid: its span of instants and the wall-clock hours it really has. */
export type DayColumn = {
	date: string;
	start: number;
	end: number;
	slots: HourSlot[];
};

/**
 * A DST change gives the date 23 or 25 hours. A repeated hour gets its own
 * slot ("02:00#1"), and a skipped one has none.
 */
export function dayColumn(date: string, timezone: string): DayColumn {
	const start = startOfLocalDate(date, timezone);
	const end = startOfLocalDate(addDaysToDate(date, 1), timezone);
	const seen = new Map<string, number>();
	const slots: HourSlot[] = [];
	for (let at = start; at < end; at += HOUR_MS) {
		const label = formatTimeIn(new Date(at).toISOString(), timezone);
		const pass = seen.get(label) ?? 0;
		seen.set(label, pass + 1);
		slots.push({ key: `${label}#${pass}`, start: at });
	}
	return { date, start, end, slots };
}

/** A row of the time grid: an hour on the wall clock. */
export type GridRow = { key: string; label: string };

/**
 * Every hour any of the columns has, in wall-clock order, so a time sits at
 * the same height in every column even in a week with a DST change.
 */
export function gridRows(columns: DayColumn[]): GridRow[] {
	const keys = new Set(
		columns.flatMap((column) => column.slots.map(({ key }) => key)),
	);
	return [...keys].sort().map((key) => ({
		key,
		label: key.slice(0, key.indexOf("#")),
	}));
}

/** Minutes from the top of the grid to an instant, clamped to the column. */
export function positionOf(
	instant: number,
	column: DayColumn,
	rows: GridRow[],
) {
	if (instant <= column.start) return 0;
	if (instant >= column.end) return rows.length * 60;
	const slot = column.slots.findLast(({ start }) => start <= instant);
	const row = rows.findIndex(({ key }) => key === slot?.key);
	return row * 60 + (instant - (slot?.start ?? column.start)) / MINUTE_MS;
}

/** Minutes from the top of the grid to a wall time like "09:30"; a skipped time moves to the next hour. */
export function positionOfWallTime(time: string, rows: GridRow[]) {
	const [hour = "00", minute = "0"] = time.split(":");
	const row = rows.findIndex(({ label }) => label >= `${hour}:00`);
	return row === -1 ? rows.length * 60 : row * 60 + Number(minute);
}

export type GridSpan = { top: number; height: number };

/** Where a booking sits in a column, or null when it doesn't touch that date. Past midnight it continues in the next column. */
export function bookingSpan(
	booking: { startsAt: string; endsAt: string },
	column: DayColumn,
	rows: GridRow[],
): GridSpan | null {
	const start = Date.parse(booking.startsAt);
	const end = Date.parse(booking.endsAt);
	if (end <= column.start || start >= column.end) return null;
	const top = positionOf(start, column, rows);
	return { top, height: positionOf(end, column, rows) - top };
}

/**
 * The parts of a column outside business hours: before and after the
 * weekday's range, the whole day when it has none or is a closure, and any
 * hour the date doesn't have.
 */
export function closedSpans(
	column: DayColumn,
	rows: GridRow[],
	weekly: WeeklyRangeDto[],
	closures: Pick<ClosureDto, "date">[],
): GridSpan[] {
	const total = rows.length * 60;
	const range = weekly.find(
		({ weekday }) => weekday === getISODay(parseISO(column.date)),
	);
	const closed = !range || closures.some(({ date }) => date === column.date);
	const spans: GridSpan[] = [];
	if (closed) spans.push({ top: 0, height: total });
	else {
		const open = positionOfWallTime(range.start, rows);
		const close = positionOfWallTime(range.end, rows);
		if (open > 0) spans.push({ top: 0, height: open });
		if (close < total) spans.push({ top: close, height: total - close });
	}
	const own = new Set(column.slots.map(({ key }) => key));
	rows.forEach(({ key }, index) => {
		if (!own.has(key)) spans.push({ top: index * 60, height: 60 });
	});
	return spans;
}

/** The earliest opening time of the week as a grid position, to scroll to; 8:00 without hours. */
export function firstOpeningPosition(
	weekly: WeeklyRangeDto[],
	rows: GridRow[],
) {
	const earliest = weekly.map(({ start }) => start).sort()[0] ?? "08:00";
	return positionOfWallTime(earliest, rows);
}

/** A booking belongs to the local date it starts on in the month view. */
export function groupByStartDate<T extends { startsAt: string }>(
	bookings: T[],
	timezone: string,
) {
	const byDate = new Map<string, T[]>();
	for (const booking of bookings) {
		const date = localDateOf(booking.startsAt, timezone);
		byDate.set(date, [...(byDate.get(date) ?? []), booking]);
	}
	for (const list of byDate.values())
		list.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
	return byDate;
}

/**
 * The instant at a grid position in a column, rounded down to `step` minutes,
 * or null on an hour the date doesn't have.
 */
export function instantAt(
	position: number,
	column: DayColumn,
	rows: GridRow[],
	step = 15,
) {
	const row = rows[Math.floor(position / 60)];
	const slot = column.slots.find(({ key }) => key === row?.key);
	if (!slot) return null;
	const minutes = Math.floor((position % 60) / step) * step;
	return new Date(slot.start + minutes * MINUTE_MS);
}

/** "November 2026", "2 – 8 November 2026" or "Wednesday, 4 November 2026". */
export function rangeTitle(view: CalendarView, date: string) {
	if (view === "month") return format(parseISO(date), "MMMM yyyy");
	if (view === "day") return format(parseISO(date), "EEEE, d MMMM yyyy");
	const [first = date] = visibleDates("week", date);
	const last = addDaysToDate(first, 6);
	const sameMonth = first.slice(0, 7) === last.slice(0, 7);
	const start = format(parseISO(first), sameMonth ? "d" : "d MMMM");
	return `${start} – ${format(parseISO(last), "d MMMM yyyy")}`;
}
