import { tzOffset } from "@date-fns/tz";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** "YYYY-MM-DD" shifted by whole days. */
export const addDaysToDate = (date: string, days: number) =>
	new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

/** The first instant of a local date; a midnight DST skips starts the day when the clocks jump. */
export const startOfLocalDate = (date: string, timezone: string) => {
	const wall = Date.parse(date);
	const offsetAt = (instant: number) =>
		tzOffset(timezone, new Date(instant)) * MINUTE_MS;
	const instants = [wall - DAY_MS, wall + DAY_MS].map(
		(time) => wall - offsetAt(time),
	);
	const matching = instants.filter(
		(instant) => instant + offsetAt(instant) === wall,
	);
	return new Date(
		matching.length > 0 ? Math.min(...matching) : Math.max(...instants),
	);
};

/** Inclusive local dates as the half-open span of instants they cover. */
export const localDateRange = (
	from: string | undefined,
	to: string | undefined,
	timezone: string,
) => ({
	start: from ? startOfLocalDate(from, timezone) : undefined,
	end: to ? startOfLocalDate(addDaysToDate(to, 1), timezone) : undefined,
});
