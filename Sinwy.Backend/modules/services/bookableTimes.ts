import { tzOffset } from "@date-fns/tz";
import type { WeeklyRangeDto } from "@sinwy/shared";
import { addMinutes } from "date-fns";

export const BOOKABLE_TIME_STEP_MINUTES = 15;

/** A half-open span of time `[start, end)`. */
export type BusyInterval = { start: Date; end: Date };

export type BookableTimesInput = {
	timezone: string;
	weekly: WeeklyRangeDto[];
	/** Closed local dates, "YYYY-MM-DD" */
	closures: string[];
	/** Already padded by their own buffers */
	busy: BusyInterval[];
	durationMinutes: number;
	bufferBeforeMinutes: number;
	bufferAfterMinutes: number;
	/** Local dates, "YYYY-MM-DD", both inclusive */
	from: string;
	to: string;
	now: Date;
	minNoticeMinutes: number;
	stepMinutes: number;
};

type LocalDate = { iso: string; weekday: number; midnight: number };

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const localDates = (from: string, to: string) => {
	const dates: LocalDate[] = [];
	const last = Date.parse(to);
	for (let midnight = Date.parse(from); midnight <= last; midnight += DAY_MS) {
		const date = new Date(midnight);
		dates.push({
			iso: date.toISOString().slice(0, 10),
			weekday: date.getUTCDay() || 7,
			midnight,
		});
	}
	return dates;
};

const minutesOf = (clock: string) => {
	const [hours = 0, minutes = 0] = clock.split(":").map(Number);
	return hours * 60 + minutes;
};

const offsetAt = (timezone: string, instant: number) =>
	tzOffset(timezone, new Date(instant)) * MINUTE_MS;

/**
 * Wall-clock times are read as if they were UTC, then shifted by the zone's offsets that day.
 * Readings come back earliest first: none match in a DST gap, two in a DST overlap.
 */
const readingsOf = (date: LocalDate, minutes: number, timezone: string) => {
	const wall = date.midnight + minutes * MINUTE_MS;
	const offsets = new Set(
		[wall - DAY_MS, wall + DAY_MS].map((time) => offsetAt(timezone, time)),
	);
	const instants = [...offsets]
		.map((offset) => wall - offset)
		.sort((a, b) => a - b);
	const matching = instants.filter(
		(instant) => instant + offsetAt(timezone, instant) === wall,
	);
	return { instants, matching };
};

const overlaps = (a: BusyInterval, b: BusyInterval) =>
	a.start < b.end && b.start < a.end;

/** Start times on the step's clock marks where the appointment fits the hours and its buffered window misses every busy interval. */
export const bookableTimes = (input: BookableTimesInput): Date[] => {
	const closed = new Set(input.closures);
	const earliest = addMinutes(input.now, input.minNoticeMinutes);
	const times = new Map<number, Date>();

	for (const date of localDates(input.from, input.to)) {
		if (closed.has(date.iso)) continue;
		for (const range of input.weekly) {
			if (range.weekday !== date.weekday) continue;
			const endMinutes = minutesOf(range.end);
			const endReadings = readingsOf(date, endMinutes, input.timezone);
			// a closing time DST skips closes at the earlier reading
			const rangeEnd = endReadings.matching[0] ?? endReadings.instants[0];
			if (rangeEnd === undefined) continue;
			const step = input.stepMinutes;
			const firstMinutes = Math.ceil(minutesOf(range.start) / step) * step;

			for (let minutes = firstMinutes; minutes < endMinutes; minutes += step) {
				const [instant] = readingsOf(date, minutes, input.timezone).matching;
				if (instant === undefined) continue;
				const start = new Date(instant);
				if (start < earliest) continue;
				const end = addMinutes(start, input.durationMinutes);
				if (end.getTime() > rangeEnd) continue;
				const window = {
					start: addMinutes(start, -input.bufferBeforeMinutes),
					end: addMinutes(end, input.bufferAfterMinutes),
				};
				if (input.busy.some((busy) => overlaps(window, busy))) continue;
				times.set(start.getTime(), start);
			}
		}
	}
	return [...times.values()].sort((a, b) => a.getTime() - b.getTime());
};
