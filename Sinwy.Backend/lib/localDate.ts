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

/** Every date from `from` to `to`, inclusive. */
export const datesIn = ({ from, to }: { from: string; to: string }) => {
	const dates: string[] = [];
	for (let date = from; date <= to; date = addDaysToDate(date, 1))
		dates.push(date);
	return dates;
};

/** "Sunday 1 March 2099 at 10:00 (Europe/Vilnius)" */
export const formatLocalTime = (instant: Date, timezone: string) =>
	`${new Intl.DateTimeFormat("en-GB", {
		timeZone: timezone,
		dateStyle: "full",
		timeStyle: "short",
	}).format(instant)} (${timezone})`;
