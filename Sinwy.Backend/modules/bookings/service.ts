import type { Membership } from "@authModule";
import { getOrganizationLocale } from "@organizationsModule";
import {
	type BookableService,
	findBookableService,
	listBookableTimes,
	todayIn,
} from "@servicesModule";
import {
	BOOKING_STATUSES,
	type BookableTimesDto,
	type BookingCalendarQuery,
	type BookingDetailDto,
	type BookingDto,
	type BookingEventActorType,
	type BookingEventDto,
	type BookingListDto,
	type BookingListQuery,
	type BookingStatus,
	type ManualBookingInput,
} from "@sinwy/shared";
import { addMinutes } from "date-fns";
import {
	type BookingEventRow,
	type BookingFilters,
	type BookingRow,
	countBookings,
	findBooking,
	findBookingEvents,
	findBookings,
	findBusyIntervals,
	insertBookingIfFree,
} from "./repository";
import {
	addDaysToDate,
	type BookingTimesQuery,
	localDateRange,
	paddedWindow,
	startOfLocalDate,
} from "./utils";

type BookingError =
	| "not-found"
	| "inactive"
	| "service-unavailable"
	| "time-taken";
export type Result<T> =
	| { ok: true; data: T }
	| { ok: false; error: BookingError };

const fail = <E extends BookingError>(error: E) =>
	({ ok: false, error }) as const;

const toBookingDto = (row: BookingRow, serviceName: string): BookingDto => ({
	id: row.id,
	serviceId: row.serviceId,
	serviceName,
	customerUserId: row.customerUserId,
	customerName: row.customerName,
	customerEmail: row.customerEmail,
	customerPhone: row.customerPhone,
	startsAt: row.startsAt.toISOString(),
	endsAt: row.endsAt.toISOString(),
	bufferBeforeMinutes: row.bufferBeforeMinutes,
	bufferAfterMinutes: row.bufferAfterMinutes,
	priceMinor: row.priceMinor,
	currency: row.currency,
	status: row.status as BookingDto["status"],
	cancelledBy: row.cancelledBy as BookingDto["cancelledBy"],
	cancellationReason: row.cancellationReason,
	customerNote: row.customerNote,
	internalNote: row.internalNote,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const toEventDto = (
	row: BookingEventRow,
	actorName: string | null,
): BookingEventDto => ({
	id: row.id,
	type: row.type as BookingEventDto["type"],
	fromStatus: row.fromStatus as BookingEventDto["fromStatus"],
	toStatus: row.toStatus as BookingEventDto["toStatus"],
	actorType: row.actorType as BookingEventDto["actorType"],
	actorName,
	payload: row.payload,
	occurredAt: row.occurredAt.toISOString(),
});

export type CreateBookingInput = {
	organizationId: string;
	service: BookableService;
	startsAt: Date;
	contact: {
		customerUserId: string | null;
		customerName: string;
		customerEmail: string | null;
		customerPhone: string | null;
	};
	customerNote: string | null;
	internalNote: string | null;
	status: Extract<BookingStatus, "pending" | "confirmed">;
	actor: { type: BookingEventActorType; userId: string | null };
};

/** Every way into the calendar: copies the service's price and buffers and refuses a taken window. */
export const createBooking = async (
	input: CreateBookingInput,
): Promise<Result<BookingDto>> => {
	const { service } = input;
	const values = {
		organizationId: input.organizationId,
		serviceId: service.id,
		...input.contact,
		startsAt: input.startsAt,
		endsAt: addMinutes(input.startsAt, service.durationMinutes),
		bufferBeforeMinutes: service.bufferBeforeMinutes,
		bufferAfterMinutes: service.bufferAfterMinutes,
		priceMinor: service.priceMinor,
		currency: service.currency,
		status: input.status,
		customerNote: input.customerNote,
		internalNote: input.internalNote,
	};
	const created = await insertBookingIfFree(values, paddedWindow(values), {
		type: "created",
		toStatus: input.status,
		actorType: input.actor.type,
		actorUserId: input.actor.userId,
	});
	return created
		? { ok: true, data: toBookingDto(created.booking, service.name) }
		: fail("time-taken");
};

/** Staff may book any start, past or outside hours; only the overlap check applies. */
export const createManualBooking = async (
	membership: Membership,
	memberUserId: string,
	input: ManualBookingInput,
): Promise<Result<BookingDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const service = await findBookableService(
		membership.organizationId,
		input.serviceId,
	);
	if (!service) return fail("not-found");
	if (!service.isActive) return fail("service-unavailable");

	return createBooking({
		organizationId: membership.organizationId,
		service,
		startsAt: new Date(input.startsAt),
		contact: {
			customerUserId: null,
			customerName: input.customerName,
			customerEmail: input.customerEmail,
			customerPhone: input.customerPhone,
		},
		customerNote: null,
		internalNote: input.internalNote,
		status: "confirmed",
		actor: { type: "member", userId: memberUserId },
	});
};

/** Padded windows of the bookings that hold time between `from` and `to`. */
export const listBusyIntervals = (
	organizationId: string,
	from: Date,
	to: Date,
	excludeBookingId?: string,
) =>
	findBusyIntervals(organizationId, { start: from, end: to }, excludeBookingId);

/** Bookable times minus busy time; `excludeBookingId` frees a booking's own window for its reschedule. */
export const listBookingTimes = async (
	membership: Membership,
	query: BookingTimesQuery,
	now = new Date(),
): Promise<Result<BookableTimesDto>> => {
	const { organizationId } = membership;
	const locale = await getOrganizationLocale(organizationId);
	if (!locale) return fail("not-found");

	// a day either side covers any buffer reaching across the range's edges
	const busy = await listBusyIntervals(
		organizationId,
		startOfLocalDate(addDaysToDate(query.from, -1), locale.timezone),
		startOfLocalDate(addDaysToDate(query.to, 2), locale.timezone),
		query.excludeBookingId,
	);
	return listBookableTimes(
		organizationId,
		query.serviceId,
		{ from: query.from, to: query.to },
		busy,
		now,
	);
};

const ALL_BUT_CANCELLED = BOOKING_STATUSES.filter(
	(status) => status !== "cancelled",
);

const toFilters = (
	query: Omit<BookingCalendarQuery, "from" | "to"> & {
		from?: string | undefined;
		to?: string | undefined;
	},
	timezone: string,
): BookingFilters => {
	const { start, end } = localDateRange(query.from, query.to, timezone);
	return {
		start,
		end,
		statuses: query.status.length > 0 ? query.status : ALL_BUT_CANCELLED,
		serviceIds: query.serviceId,
		q: query.q,
	};
};

export const listBookings = async (
	membership: Membership,
	query: BookingListQuery,
	now = new Date(),
): Promise<Result<BookingListDto>> => {
	const { organizationId } = membership;
	const locale = await getOrganizationLocale(organizationId);
	if (!locale) return fail("not-found");

	const upcoming = !query.from && !query.to;
	const filters = toFilters(
		upcoming ? { ...query, from: todayIn(locale.timezone, now) } : query,
		locale.timezone,
	);
	const [rows, total] = await Promise.all([
		findBookings(organizationId, filters, query.sort, {
			limit: query.pageSize,
			offset: (query.page - 1) * query.pageSize,
		}),
		countBookings(organizationId, filters),
	]);
	return {
		ok: true,
		data: {
			items: rows.map((row) => toBookingDto(row.booking, row.serviceName)),
			total,
		},
	};
};

export const listCalendarBookings = async (
	membership: Membership,
	query: BookingCalendarQuery,
): Promise<Result<BookingDto[]>> => {
	const { organizationId } = membership;
	const locale = await getOrganizationLocale(organizationId);
	if (!locale) return fail("not-found");

	const rows = await findBookings(
		organizationId,
		toFilters(query, locale.timezone),
		"startsAt",
	);
	return {
		ok: true,
		data: rows.map((row) => toBookingDto(row.booking, row.serviceName)),
	};
};

export const getBooking = async (
	membership: Membership,
	bookingId: string,
): Promise<Result<BookingDetailDto>> => {
	const row = await findBooking(membership.organizationId, bookingId);
	if (!row) return fail("not-found");

	const events = await findBookingEvents(bookingId);
	return {
		ok: true,
		data: {
			...toBookingDto(row.booking, row.serviceName),
			history: events.map((event) => toEventDto(event.event, event.actorName)),
		},
	};
};
