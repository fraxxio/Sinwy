import { membershipFrom, sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler, IReqContext } from "@backend/lib/app/types";
import {
	API_ERROR_CODES,
	bookingCalendarQuerySchema,
	bookingListQuerySchema,
	bookingUpdateSchema,
	cancelBookingSchema,
	manualBookingSchema,
	rescheduleBookingSchema,
} from "@sinwy/shared";
import type { z } from "zod";
import {
	changeBookingStatus,
	createManualBooking,
	getBooking,
	listBookings,
	listBookingTimes,
	listCalendarBookings,
	type Result,
	rescheduleBooking,
	type StaffStatusChange,
	updateBookingDetails,
} from "./service";
import { bookingTimesQuery } from "./utils";

type BookingError = Extract<Result<never>, { ok: false }>["error"];

const respondError = (error: BookingError) => {
	switch (error) {
		case "inactive":
			return fail(
				"This organization doesn't have an active plan yet",
				409,
				API_ERROR_CODES.ORGANIZATION_INACTIVE,
			);
		case "service-unavailable":
			return fail("This service isn't taking bookings", 409);
		case "time-taken":
			return fail(
				"That time was just taken",
				409,
				API_ERROR_CODES.BOOKING_TIME_TAKEN,
			);
		case "illegal-transition":
			return fail(
				"This booking can't change to that status now",
				409,
				API_ERROR_CODES.BOOKING_STATUS_CHANGE_NOT_ALLOWED,
			);
		case "not-reschedulable":
			return fail("Only pending and confirmed bookings can be moved", 409);
		case "contact-locked":
			return fail(
				"The contact of a booking made from an account can't be edited",
				409,
			);
		case "not-found":
			return fail("Not found", 404);
	}
};

const parseBody = async <T extends z.ZodType>(c: IReqContext, schema: T) => {
	const body = schema.safeParse(await c.req.json().catch(() => null));
	return body.success
		? ({ ok: true, data: body.data } as const)
		: ({
				ok: false,
				response: fail(body.error.issues[0]?.message ?? "Invalid body", 400),
			} as const);
};

// filters repeat (`status=pending&status=confirmed`), so they're read as lists
const parseQuery = <T extends z.ZodType>(c: IReqContext, schema: T) => {
	const params = new URL(c.req.url).searchParams;
	const query = schema.safeParse({
		...Object.fromEntries(params),
		serviceId: params.getAll("serviceId"),
		status: params.getAll("status"),
	});
	return query.success
		? ({ ok: true, data: query.data } as const)
		: ({
				ok: false,
				response: fail(query.error.issues[0]?.message ?? "Invalid query", 400),
			} as const);
};

const bookingIdOf = (c: IReqContext) =>
	(c.req.params as { bookingId: string }).bookingId;

export const createManualBookingHandler: Handler = async (c) => {
	const body = await parseBody(c, manualBookingSchema);
	if (!body.ok) return body.response;

	const result = await createManualBooking(
		membershipFrom(c),
		sessionFrom(c).user.id,
		body.data,
	);
	return result.ok
		? ok(result.data, 201, "Booking created")
		: respondError(result.error);
};

export const listBookingTimesHandler: Handler = async (c) => {
	const params = new URL(c.req.url).searchParams;
	const query = bookingTimesQuery.safeParse(Object.fromEntries(params));
	if (!query.success)
		return fail(query.error.issues[0]?.message ?? "Invalid query", 400);

	const result = await listBookingTimes(membershipFrom(c), query.data);
	return result.ok ? ok(result.data) : respondError(result.error);
};

export const listBookingsHandler: Handler = async (c) => {
	const query = parseQuery(c, bookingListQuerySchema);
	if (!query.ok) return query.response;

	const result = await listBookings(membershipFrom(c), query.data);
	return result.ok ? ok(result.data) : respondError(result.error);
};

export const listCalendarBookingsHandler: Handler = async (c) => {
	const query = parseQuery(c, bookingCalendarQuerySchema);
	if (!query.ok) return query.response;

	const result = await listCalendarBookings(membershipFrom(c), query.data);
	return result.ok ? ok(result.data) : respondError(result.error);
};

export const getBookingHandler: Handler = async (c) => {
	const result = await getBooking(membershipFrom(c), bookingIdOf(c));
	return result.ok ? ok(result.data) : respondError(result.error);
};

const statusHandler =
	(to: Exclude<StaffStatusChange, "cancelled">): Handler =>
	async (c) => {
		const result = await changeBookingStatus(
			membershipFrom(c),
			sessionFrom(c).user.id,
			bookingIdOf(c),
			to,
		);
		return result.ok ? ok(result.data) : respondError(result.error);
	};

export const confirmBookingHandler = statusHandler("confirmed");
export const completeBookingHandler = statusHandler("completed");
export const markNoShowHandler = statusHandler("no_show");

export const cancelBookingHandler: Handler = async (c) => {
	const body = await parseBody(c, cancelBookingSchema);
	if (!body.ok) return body.response;

	const result = await changeBookingStatus(
		membershipFrom(c),
		sessionFrom(c).user.id,
		bookingIdOf(c),
		"cancelled",
		body.data.reason,
	);
	return result.ok ? ok(result.data) : respondError(result.error);
};

export const rescheduleBookingHandler: Handler = async (c) => {
	const body = await parseBody(c, rescheduleBookingSchema);
	if (!body.ok) return body.response;

	const result = await rescheduleBooking(
		membershipFrom(c),
		sessionFrom(c).user.id,
		bookingIdOf(c),
		body.data,
	);
	return result.ok ? ok(result.data) : respondError(result.error);
};

export const updateBookingHandler: Handler = async (c) => {
	const body = await parseBody(c, bookingUpdateSchema);
	if (!body.ok) return body.response;

	const result = await updateBookingDetails(
		membershipFrom(c),
		sessionFrom(c).user.id,
		bookingIdOf(c),
		body.data,
	);
	return result.ok ? ok(result.data) : respondError(result.error);
};
