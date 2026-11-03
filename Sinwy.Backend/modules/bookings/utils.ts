import { tzOffset } from "@date-fns/tz";
import { bookableTimesQuerySchema } from "@sinwy/shared";
import { addMinutes } from "date-fns";
import { z } from "zod";

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

/** The time a booking holds: its appointment padded by its own buffers. */
export const paddedWindow = (booking: {
	startsAt: Date;
	endsAt: Date;
	bufferBeforeMinutes: number;
	bufferAfterMinutes: number;
}) => ({
	start: addMinutes(booking.startsAt, -booking.bufferBeforeMinutes),
	end: addMinutes(booking.endsAt, booking.bufferAfterMinutes),
});

export const bookingTimesQuery = z
	.object({
		serviceId: z.string().min(1, "Pick a service"),
		excludeBookingId: z.string().min(1).optional(),
	})
	.and(bookableTimesQuerySchema);

/** `%`, `_` and `\` match themselves in an `ilike` pattern. */
export const containsPattern = (text: string) =>
	`%${text.replace(/[\\%_]/g, "\\$&")}%`;

export type BookingTimesQuery = z.infer<typeof bookingTimesQuery>;
