import { tz } from "@date-fns/tz";
import { addDays, format, parseISO } from "date-fns";

/** "Nov 21, 2026"; "—" for a date that doesn't parse, so one bad value can't break a page. */
export function formatDay(iso: string, locale?: string) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/** The calendar date at `now` in `timezone`, as "YYYY-MM-DD". */
export const todayIn = (timezone: string, now = new Date()) =>
	format(now, "yyyy-MM-dd", { in: tz(timezone) });

/** "YYYY-MM-DD" shifted by whole days. */
export const addDaysToDate = (date: string, days: number) =>
	format(addDays(parseISO(date), days), "yyyy-MM-dd");

/** The local date of an instant in `timezone`, as "YYYY-MM-DD". */
export const localDateOf = (iso: string, timezone: string) =>
	todayIn(timezone, new Date(iso));

/** "14:30" on the wall clock of `timezone`. */
export const formatTimeIn = (iso: string, timezone: string) =>
	format(new Date(iso), "HH:mm", { in: tz(timezone) });

/** "Tuesday, 3 November 2026" in `timezone`. */
export const formatDateIn = (iso: string, timezone: string) =>
	format(new Date(iso), "EEEE, d MMMM yyyy", { in: tz(timezone) });
