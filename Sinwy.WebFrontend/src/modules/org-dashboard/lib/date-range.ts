import { z } from "zod";
import { addDaysToDate, todayIn } from "#/shared/lib/date";

/** An inclusive range of org-local "YYYY-MM-DD" dates. */
export type DateRange = { from: string; to: string };

export type DateRangePreset = DateRange & { label: string };

export const optionalDate = z.iso.date().optional().catch(undefined);

/** A one-sided or reversed range is dropped, so the API's default applies. */
export const validRangeOr = <
	T extends { from?: string | undefined; to?: string | undefined },
>(
	search: T,
): T =>
	search.from && search.to && search.from <= search.to
		? search
		: { ...search, from: undefined, to: undefined };

/** Applies one changed end of the range; the other end follows it when the range would turn around. */
export function changeRange(
	current: DateRange,
	change: Partial<DateRange>,
): DateRange {
	const next = { ...current, ...change };
	if (next.from <= next.to) return next;
	return change.from
		? { from: next.from, to: next.from }
		: { from: next.to, to: next.to };
}

/** The last `days` complete days, ending yesterday in `timezone`. */
export function completeDaysRange(
	days: number,
	timezone: string,
	now = new Date(),
): DateRange {
	const today = todayIn(timezone, now);
	return { from: addDaysToDate(today, -days), to: addDaysToDate(today, -1) };
}

const clampDate = (date: string, { from, to }: DateRange) =>
	date < from ? from : date > to ? to : date;

/** Both ends moved into `window`, the way the API clamps a requested range. */
export const clampRange = (range: DateRange, window: DateRange): DateRange => ({
	from: clampDate(range.from, window),
	to: clampDate(range.to, window),
});

export const sameRange = (a: DateRange, b: DateRange) =>
	a.from === b.from && a.to === b.to;
