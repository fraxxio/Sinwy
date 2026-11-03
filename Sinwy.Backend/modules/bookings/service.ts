import type { Membership } from "@authModule";
import {
	getOrganizationLocale,
	type PublicOrganization,
} from "@organizationsModule";
import {
	type BookableService,
	findBookableService,
	listBookableTimes,
	listPublicServices,
	openMinutes,
	todayIn,
} from "@servicesModule";
import {
	ACTIVE_BOOKING_STATUSES,
	BOOKING_LIMITS,
	BOOKING_STATUSES,
	type BookableTimesDto,
	type BookableTimesQuery,
	type BookingCalendarQuery,
	type BookingDetailDto,
	type BookingDto,
	type BookingEventActorType,
	type BookingEventDto,
	type BookingListDto,
	type BookingListQuery,
	type BookingOverviewDto,
	type BookingStatus,
	type BookingUpdateInput,
	type CustomerBookingDto,
	canTransition,
	type ManualBookingInput,
	type RescheduleBookingInput,
	type SelfBookingInput,
	type StorefrontDto,
} from "@sinwy/shared";
import { addMinutes } from "date-fns";
import { dispatchBookingEvent } from "./dispatch";
import {
	type BookingEventRow,
	type BookingFilters,
	type BookingRow,
	changeBooking,
	countBookings,
	countNeedingAttention,
	findBooking,
	findBookingEvents,
	findBookings,
	findBusyIntervals,
	findPendingRequests,
	insertBookingIfFree,
	sumBookingsBetween,
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
	| "time-taken"
	| "not-bookable"
	| "limit-reached"
	| "illegal-transition"
	| "not-reschedulable"
	| "contact-locked";
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
	/** Refuses the booking when its customer already holds this many upcoming ones here. */
	upcomingLimit?: number;
};

/** Every way into the calendar: copies the service's price and buffers and refuses a taken window. */
export const createBooking = async (
	input: CreateBookingInput,
	now = new Date(),
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
	const created = await insertBookingIfFree(
		values,
		paddedWindow(values),
		{
			type: "created",
			toStatus: input.status,
			actorType: input.actor.type,
			actorUserId: input.actor.userId,
		},
		input.upcomingLimit === undefined
			? undefined
			: { upcoming: input.upcomingLimit, now },
	);
	if (!created.ok) return created;
	await dispatchAll(created.events);
	return { ok: true, data: toBookingDto(created.booking, service.name) };
};

const dispatchAll = async (events: BookingEventRow[]) => {
	for (const event of events) await dispatchBookingEvent(event);
};

/** Maps a committed change to its DTO, sending its emails first. */
const committed = async (
	result: Awaited<ReturnType<typeof changeBooking<BookingError>>>,
): Promise<Result<BookingDto>> => {
	if (!result.ok) return result;
	await dispatchAll(result.events);
	return { ok: true, data: toBookingDto(result.booking, result.serviceName) };
};

export type StaffStatusChange = Exclude<BookingStatus, "pending">;

/** Staff move a booking through the transition table; a cancel records the organization and its reason. */
export const changeBookingStatus = async (
	membership: Membership,
	memberUserId: string,
	bookingId: string,
	to: StaffStatusChange,
	reason: string | null = null,
	now = new Date(),
): Promise<Result<BookingDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const result = await changeBooking<BookingError>(
		membership.organizationId,
		bookingId,
		(row) => {
			const from = row.status as BookingStatus;
			if (!canTransition(from, to, "organization", row.startsAt, now))
				return fail("illegal-transition");
			return {
				ok: true,
				values:
					to === "cancelled"
						? {
								status: to,
								cancelledBy: "organization",
								cancellationReason: reason,
							}
						: { status: to },
				event: {
					type: "status_changed",
					fromStatus: from,
					toStatus: to,
					actorType: "member",
					actorUserId: memberUserId,
				},
			};
		},
	);
	return committed(result);
};

const isActiveStatus = (status: string) =>
	(ACTIVE_BOOKING_STATUSES as readonly string[]).includes(status);

/** Moves a pending or confirmed booking; it keeps its length, price, buffers and status. */
export const rescheduleBooking = async (
	membership: Membership,
	memberUserId: string,
	bookingId: string,
	input: RescheduleBookingInput,
): Promise<Result<BookingDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const startsAt = new Date(input.startsAt);
	const result = await changeBooking<BookingError>(
		membership.organizationId,
		bookingId,
		(row) => {
			if (!isActiveStatus(row.status)) return fail("not-reschedulable");
			const moved = {
				...row,
				startsAt,
				endsAt: new Date(
					startsAt.getTime() + row.endsAt.getTime() - row.startsAt.getTime(),
				),
			};
			return {
				ok: true,
				values: { startsAt: moved.startsAt, endsAt: moved.endsAt },
				window: paddedWindow(moved),
				event: {
					type: "rescheduled",
					actorType: "member",
					actorUserId: memberUserId,
					payload: {
						previousStartsAt: row.startsAt.toISOString(),
						previousEndsAt: row.endsAt.toISOString(),
						startsAt: moved.startsAt.toISOString(),
						endsAt: moved.endsAt.toISOString(),
					},
				},
			};
		},
		{ lockOrganization: true },
	);
	return committed(result);
};

const CONTACT_FIELDS = [
	"customerName",
	"customerEmail",
	"customerPhone",
] as const;

/** The internal note on any booking; the contact only on manual ones, logged with the fields that changed. */
export const updateBookingDetails = async (
	membership: Membership,
	memberUserId: string,
	bookingId: string,
	input: BookingUpdateInput,
): Promise<Result<BookingDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const contact =
		input.customerName === undefined
			? null
			: {
					customerName: input.customerName,
					customerEmail: input.customerEmail ?? null,
					customerPhone: input.customerPhone ?? null,
				};
	const result = await changeBooking<BookingError>(
		membership.organizationId,
		bookingId,
		(row) => {
			if (contact && row.customerUserId) return fail("contact-locked");
			const fields = contact
				? CONTACT_FIELDS.filter((field) => contact[field] !== row[field])
				: [];
			return {
				ok: true,
				values: {
					...(input.internalNote !== undefined && {
						internalNote: input.internalNote,
					}),
					...(fields.length > 0 && contact),
				},
				event:
					fields.length > 0
						? {
								type: "contact_updated",
								actorType: "member",
								actorUserId: memberUserId,
								payload: { fields },
							}
						: null,
			};
		},
	);
	return committed(result);
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

/** Bookable times on local dates, minus the time other bookings hold. */
const findFreeTimes = async (
	organizationId: string,
	timezone: string,
	serviceId: string,
	range: BookableTimesQuery,
	now: Date,
	excludeBookingId?: string,
) => {
	// a day either side covers any buffer reaching across the range's edges
	const busy = await listBusyIntervals(
		organizationId,
		startOfLocalDate(addDaysToDate(range.from, -1), timezone),
		startOfLocalDate(addDaysToDate(range.to, 2), timezone),
		excludeBookingId,
	);
	return listBookableTimes(organizationId, serviceId, range, busy, now);
};

/** `excludeBookingId` frees a booking's own window for its reschedule. */
export const listBookingTimes = async (
	membership: Membership,
	query: BookingTimesQuery,
	now = new Date(),
): Promise<Result<BookableTimesDto>> => {
	const locale = await getOrganizationLocale(membership.organizationId);
	if (!locale) return fail("not-found");

	return findFreeTimes(
		membership.organizationId,
		locale.timezone,
		query.serviceId,
		{ from: query.from, to: query.to },
		now,
		query.excludeBookingId,
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

const OVERVIEW_PENDING_ROWS = 5;

/** Monday to Sunday of the ISO week holding `date`. */
const isoWeekOf = (date: string) => {
	const weekday = new Date(date).getUTCDay() || 7;
	const from = addDaysToDate(date, 1 - weekday);
	return { from, to: addDaysToDate(from, 6) };
};

export const getOverview = async (
	membership: Membership,
	now = new Date(),
): Promise<Result<BookingOverviewDto>> => {
	const { organizationId } = membership;
	const locale = await getOrganizationLocale(organizationId);
	if (!locale) return fail("not-found");

	const { timezone } = locale;
	const today = todayIn(timezone, now);
	const week = isoWeekOf(today);
	const weekStart = startOfLocalDate(week.from, timezone);
	const weekEnd = startOfLocalDate(addDaysToDate(week.to, 1), timezone);

	const [todayRows, sums, open, pending, attention] = await Promise.all([
		findBookings(
			organizationId,
			toFilters(
				{ from: today, to: today, status: [], serviceId: [], q: undefined },
				timezone,
			),
			"startsAt",
		),
		sumBookingsBetween(organizationId, weekStart, weekEnd),
		openMinutes(organizationId, week.from, week.to),
		findPendingRequests(organizationId, now, OVERVIEW_PENDING_ROWS),
		countNeedingAttention(organizationId, now),
	]);
	const toDto = (row: { booking: BookingRow; serviceName: string }) =>
		toBookingDto(row.booking, row.serviceName);
	return {
		ok: true,
		data: {
			timezone,
			currency: locale.currency,
			today,
			week,
			todayBookings: todayRows.map(toDto),
			revenue: {
				bookedMinor: sums.bookedMinor,
				completedMinor: sums.completedMinor,
			},
			pending: { total: pending.total, oldest: pending.rows.map(toDto) },
			occupancy: {
				bookedMinutes: sums.bookedMinutes,
				openMinutes: open,
				percent:
					open > 0 ? Math.round((sums.bookedMinutes / open) * 100) : null,
			},
			needsAttention: attention,
		},
	};
};

export const getStorefront = async ({
	id,
	...organization
}: PublicOrganization): Promise<StorefrontDto> => ({
	organization,
	services: await listPublicServices(id),
});

/** The local dates customers may book: today through `selfBookingDays` ahead. */
const selfBookingDates = (timezone: string, now: Date) => {
	const first = todayIn(timezone, now);
	return {
		first,
		last: addDaysToDate(first, BOOKING_LIMITS.selfBookingDays),
	};
};

/** Free times within the self-booking window; a range outside it is empty. */
export const listStorefrontTimes = async (
	organization: PublicOrganization,
	serviceId: string,
	range: BookableTimesQuery,
	now = new Date(),
): Promise<Result<BookableTimesDto>> => {
	const { first, last } = selfBookingDates(organization.timezone, now);
	const from = range.from > first ? range.from : first;
	const to = range.to < last ? range.to : last;
	if (from > to)
		return { ok: true, data: { timezone: organization.timezone, times: [] } };
	return await findFreeTimes(
		organization.id,
		organization.timezone,
		serviceId,
		{ from, to },
		now,
	);
};

/**
 * A signed-in customer books one of the service's current free times, which
 * staff bookings don't need. It waits for approval when the service asks for it.
 */
export const createSelfBooking = async (
	organization: PublicOrganization,
	customer: { id: string; name: string; email: string },
	input: SelfBookingInput,
	now = new Date(),
): Promise<Result<CustomerBookingDto>> => {
	const service = await findBookableService(organization.id, input.serviceId);
	if (!service) return fail("not-found");
	if (!service.isActive) return fail("service-unavailable");

	const startsAt = new Date(input.startsAt);
	const date = todayIn(organization.timezone, startsAt);
	const { first, last } = selfBookingDates(organization.timezone, now);
	if (date < first || date > last) return fail("not-bookable");
	const free = await findFreeTimes(
		organization.id,
		organization.timezone,
		service.id,
		{ from: date, to: date },
		now,
	);
	if (!free.ok) return free;
	if (!free.data.times.includes(startsAt.toISOString()))
		return fail("not-bookable");

	const created = await createBooking(
		{
			organizationId: organization.id,
			service,
			startsAt,
			contact: {
				customerUserId: customer.id,
				customerName: customer.name,
				customerEmail: customer.email,
				customerPhone: input.customerPhone,
			},
			customerNote: input.customerNote,
			internalNote: null,
			status: service.requiresApproval ? "pending" : "confirmed",
			actor: { type: "customer", userId: customer.id },
			upcomingLimit: BOOKING_LIMITS.upcomingSelfBookings,
		},
		now,
	);
	if (!created.ok) return created;
	const { data } = created;
	return {
		ok: true,
		data: {
			id: data.id,
			serviceId: data.serviceId,
			serviceName: data.serviceName,
			startsAt: data.startsAt,
			endsAt: data.endsAt,
			priceMinor: data.priceMinor,
			currency: data.currency,
			status: data.status,
			cancelledBy: data.cancelledBy,
			cancellationReason: data.cancellationReason,
			customerNote: data.customerNote,
			createdAt: data.createdAt,
			organization: {
				name: organization.name,
				slug: organization.slug,
				timezone: organization.timezone,
			},
		},
	};
};
