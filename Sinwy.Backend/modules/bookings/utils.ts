import { bookableTimesQuerySchema } from "@sinwy/shared";
import { addMinutes } from "date-fns";
import { z } from "zod";

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
