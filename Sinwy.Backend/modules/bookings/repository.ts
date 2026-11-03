import db from "@db";
import { booking, bookingEvent } from "@db/schema/bookingSchema";
import {
	organization,
	organizationProfile,
} from "@db/schema/organizationSchema";
import { service } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import type { BusyInterval } from "@servicesModule";
import {
	ACTIVE_BOOKING_STATUSES,
	type BookingSort,
	type BookingStatus,
	type CustomerBookingTab,
} from "@sinwy/shared";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	gte,
	ilike,
	inArray,
	isNull,
	lt,
	lte,
	max,
	ne,
	not,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { containsPattern } from "./utils";

export type BookingRow = typeof booking.$inferSelect;
export type BookingEventRow = typeof bookingEvent.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BookingFilters = {
	start?: Date | undefined;
	end?: Date | undefined;
	statuses: BookingStatus[];
	serviceIds: string[];
	q?: string | undefined;
};

const paddedStart = sql<Date>`${booking.startsAt} - make_interval(mins => ${booking.bufferBeforeMinutes})`;
const paddedEnd = sql<Date>`${booking.endsAt} + make_interval(mins => ${booking.bufferAfterMinutes})`;

const instant = (date: Date) => sql`${date.toISOString()}::timestamptz`;

/** Active bookings whose padded window overlaps `[start, end)`. */
const holding = (
	organizationId: string,
	window: BusyInterval,
	excludeBookingId?: string,
) =>
	and(
		eq(booking.organizationId, organizationId),
		inArray(booking.status, ACTIVE_BOOKING_STATUSES),
		sql`${paddedStart} < ${instant(window.end)}`,
		sql`${paddedEnd} > ${instant(window.start)}`,
		excludeBookingId ? ne(booking.id, excludeBookingId) : undefined,
	);

/** Serializes every booking write in one organization until the transaction ends. */
const lockOrganization = (tx: Tx, organizationId: string) =>
	tx.execute(sql`select pg_advisory_xact_lock(hashtext(${organizationId}))`);

/** Call under `lockOrganization`, so nothing books the window between the check and the write. */
export const isTimeTaken = async (
	tx: Tx,
	organizationId: string,
	window: BusyInterval,
	excludeBookingId?: string,
) => {
	const [row] = await tx
		.select({ id: booking.id })
		.from(booking)
		.where(holding(organizationId, window, excludeBookingId))
		.limit(1);
	return Boolean(row);
};

export const findBusyIntervals = (
	organizationId: string,
	window: BusyInterval,
	excludeBookingId?: string,
): Promise<BusyInterval[]> =>
	db
		.select({
			start: paddedStart.mapWith(booking.startsAt),
			end: paddedEnd.mapWith(booking.endsAt),
		})
		.from(booking)
		.where(holding(organizationId, window, excludeBookingId))
		.orderBy(asc(booking.startsAt));

type NewBooking = Omit<typeof booking.$inferInsert, "id">;
type NewEvent = Omit<typeof bookingEvent.$inferInsert, "id" | "bookingId">;

/** The customer's pending and confirmed bookings in the organization that haven't started. */
const countUpcomingOf = async (
	tx: Tx,
	organizationId: string,
	customerUserId: string,
	now: Date,
) => {
	const [row] = await tx
		.select({ total: count() })
		.from(booking)
		.where(
			and(
				eq(booking.organizationId, organizationId),
				eq(booking.customerUserId, customerUserId),
				inArray(booking.status, ACTIVE_BOOKING_STATUSES),
				gte(booking.startsAt, now),
			),
		);
	return row?.total ?? 0;
};

/**
 * Inserts the booking and its `created` event unless its padded window is taken
 * or, with `cap`, its customer already holds that many upcoming bookings here.
 */
export const insertBookingIfFree = (
	values: NewBooking,
	window: BusyInterval,
	event: NewEvent,
	cap?: { upcoming: number; now: Date },
) =>
	db.transaction(async (tx) => {
		await lockOrganization(tx, values.organizationId);
		if (
			cap &&
			values.customerUserId &&
			(await countUpcomingOf(
				tx,
				values.organizationId,
				values.customerUserId,
				cap.now,
			)) >= cap.upcoming
		)
			return { ok: false, error: "limit-reached" } as const;
		if (await isTimeTaken(tx, values.organizationId, window))
			return { ok: false, error: "time-taken" } as const;

		const [row] = await tx
			.insert(booking)
			.values({ ...values, id: crypto.randomUUID() })
			.returning();
		if (!row) throw new Error("Booking insert returned no row");
		const events = await tx
			.insert(bookingEvent)
			.values({ ...event, id: crypto.randomUUID(), bookingId: row.id })
			.returning();
		return { ok: true, booking: row, events } as const;
	});

type BookingUpdate = Partial<
	Pick<
		NewBooking,
		| "status"
		| "cancelledBy"
		| "cancellationReason"
		| "startsAt"
		| "endsAt"
		| "customerName"
		| "customerEmail"
		| "customerPhone"
		| "internalNote"
	>
>;

export type BookingChange<E extends string> =
	| { ok: false; error: E }
	| {
			ok: true;
			values: BookingUpdate;
			event: NewEvent | null;
			/** Checked against other bookings under the organization lock. */
			window?: BusyInterval;
	  };

/** Staff reach their organization's bookings; customers reach the bookings made from their account. */
export type BookingScope =
	| { organizationId: string }
	| { customerUserId: string };

const inScope = (scope: BookingScope) =>
	"organizationId" in scope
		? eq(booking.organizationId, scope.organizationId)
		: eq(booking.customerUserId, scope.customerUserId);

/**
 * Locks the booking row, lets `decide` turn its current state into a change, then writes it with its event.
 * `lockOrganization` takes the organization lock first, as every write that moves a booking must.
 */
export const changeBooking = <E extends string>(
	scope: BookingScope,
	bookingId: string,
	decide: (row: BookingRow) => BookingChange<E>,
	options: { lockOrganization?: boolean } = {},
) =>
	db.transaction(async (tx) => {
		if (options.lockOrganization) {
			if (!("organizationId" in scope))
				throw new Error("Only an organization scope can lock the organization");
			await lockOrganization(tx, scope.organizationId);
		}
		const [current] = await tx
			.select(withServiceName)
			.from(booking)
			.innerJoin(service, eq(service.id, booking.serviceId))
			.where(and(inScope(scope), eq(booking.id, bookingId)))
			.for("update", { of: booking });
		if (!current) return { ok: false, error: "not-found" } as const;

		const change = decide(current.booking);
		if (!change.ok) return change;
		if (
			change.window &&
			(await isTimeTaken(
				tx,
				current.booking.organizationId,
				change.window,
				bookingId,
			))
		)
			return { ok: false, error: "time-taken" } as const;

		const [row] = await tx
			.update(booking)
			.set({ ...change.values, updatedAt: new Date() })
			.where(eq(booking.id, bookingId))
			.returning();
		if (!row) throw new Error("Booking update returned no row");
		const events = change.event
			? await tx
					.insert(bookingEvent)
					.values({ ...change.event, id: crypto.randomUUID(), bookingId })
					.returning()
			: [];
		return {
			ok: true,
			booking: row,
			serviceName: current.serviceName,
			events,
		} as const;
	});

const matching = (organizationId: string, filters: BookingFilters) =>
	and(
		eq(booking.organizationId, organizationId),
		filters.start ? gte(booking.startsAt, filters.start) : undefined,
		filters.end ? lt(booking.startsAt, filters.end) : undefined,
		filters.statuses.length > 0
			? inArray(booking.status, filters.statuses)
			: undefined,
		filters.serviceIds.length > 0
			? inArray(booking.serviceId, filters.serviceIds)
			: undefined,
		filters.q
			? or(
					ilike(booking.customerName, containsPattern(filters.q)),
					ilike(booking.customerEmail, containsPattern(filters.q)),
					ilike(booking.customerPhone, containsPattern(filters.q)),
				)
			: undefined,
	);

const ORDER: Record<BookingSort, SQL[]> = {
	startsAt: [asc(booking.startsAt), asc(booking.id)],
	"-startsAt": [desc(booking.startsAt), desc(booking.id)],
	"-createdAt": [desc(booking.createdAt), desc(booking.id)],
};

const withServiceName = { booking, serviceName: service.name };

export const findBookings = (
	organizationId: string,
	filters: BookingFilters,
	sort: BookingSort,
	page?: { limit: number; offset: number },
) => {
	const query = db
		.select(withServiceName)
		.from(booking)
		.innerJoin(service, eq(service.id, booking.serviceId))
		.where(matching(organizationId, filters))
		.orderBy(...ORDER[sort]);
	return page ? query.limit(page.limit).offset(page.offset) : query;
};

export const countBookings = async (
	organizationId: string,
	filters: BookingFilters,
) => {
	const [row] = await db
		.select({ total: count() })
		.from(booking)
		.where(matching(organizationId, filters));
	return row?.total ?? 0;
};

export const findBooking = async (
	organizationId: string,
	bookingId: string,
) => {
	const [row] = await db
		.select(withServiceName)
		.from(booking)
		.innerJoin(service, eq(service.id, booking.serviceId))
		.where(
			and(
				eq(booking.organizationId, organizationId),
				eq(booking.id, bookingId),
			),
		);
	return row ?? null;
};

/** Oldest first, with the name of the user who acted, while their account exists. */
export const findBookingEvents = (bookingId: string) =>
	db
		.select({ event: bookingEvent, actorName: user.name })
		.from(bookingEvent)
		.leftJoin(user, eq(user.id, bookingEvent.actorUserId))
		.where(eq(bookingEvent.bookingId, bookingId))
		.orderBy(asc(bookingEvent.occurredAt), asc(bookingEvent.id));

const customerBookingFields = {
	booking,
	serviceName: service.name,
	organization: {
		name: organization.name,
		slug: organization.slug,
		timezone: organization.timezone,
		city: organizationProfile.city,
		country: organizationProfile.country,
		phone: organizationProfile.phone,
		email: organizationProfile.email,
	},
};

export type CustomerBookingRow = NonNullable<
	Awaited<ReturnType<typeof findCustomerBooking>>
>;

/** Pending or confirmed and not yet over: what the customer still has ahead of them. */
const upcomingFor = (now: Date) =>
	and(
		inArray(booking.status, [...ACTIVE_BOOKING_STATUSES]),
		gt(booking.endsAt, now),
	);

const customerTab = (
	customerUserId: string,
	tab: CustomerBookingTab,
	now: Date,
) =>
	and(
		eq(booking.customerUserId, customerUserId),
		tab === "upcoming" ? upcomingFor(now) : not(upcomingFor(now) as SQL),
	);

export const findCustomerBookings = (
	customerUserId: string,
	tab: CustomerBookingTab,
	page: { limit: number; offset: number },
	now: Date,
) =>
	db
		.select(customerBookingFields)
		.from(booking)
		.innerJoin(service, eq(service.id, booking.serviceId))
		.innerJoin(organization, eq(organization.id, booking.organizationId))
		.leftJoin(
			organizationProfile,
			eq(organizationProfile.organizationId, booking.organizationId),
		)
		.where(customerTab(customerUserId, tab, now))
		.orderBy(
			...(tab === "upcoming"
				? [asc(booking.startsAt), asc(booking.id)]
				: [desc(booking.startsAt), desc(booking.id)]),
		)
		.limit(page.limit)
		.offset(page.offset);

export const countCustomerBookings = async (
	customerUserId: string,
	tab: CustomerBookingTab,
	now: Date,
) => {
	const [row] = await db
		.select({ total: count() })
		.from(booking)
		.where(customerTab(customerUserId, tab, now));
	return row?.total ?? 0;
};

export const findCustomerBooking = async (
	customerUserId: string,
	bookingId: string,
) => {
	const [row] = await db
		.select(customerBookingFields)
		.from(booking)
		.innerJoin(service, eq(service.id, booking.serviceId))
		.innerJoin(organization, eq(organization.id, booking.organizationId))
		.leftJoin(
			organizationProfile,
			eq(organizationProfile.organizationId, booking.organizationId),
		)
		.where(
			and(
				eq(booking.customerUserId, customerUserId),
				eq(booking.id, bookingId),
			),
		);
	return row ?? null;
};

export const findNextCustomerBooking = async (
	customerUserId: string,
	now: Date,
) => {
	const [row] = await db
		.select(customerBookingFields)
		.from(booking)
		.innerJoin(service, eq(service.id, booking.serviceId))
		.innerJoin(organization, eq(organization.id, booking.organizationId))
		.leftJoin(
			organizationProfile,
			eq(organizationProfile.organizationId, booking.organizationId),
		)
		.where(and(eq(booking.customerUserId, customerUserId), upcomingFor(now)))
		.orderBy(asc(booking.startsAt), asc(booking.id))
		.limit(1);
	return row ?? null;
};

/** Each still-bookable service the customer booked, once, most recently booked first. */
export const findRebookServices = (customerUserId: string) => {
	const lastBookedAt = max(booking.createdAt);
	return db
		.select({
			serviceId: service.id,
			serviceName: service.name,
			durationMinutes: service.durationMinutes,
			priceMinor: service.priceMinor,
			currency: service.currency,
			organizationSlug: organization.slug,
		})
		.from(booking)
		.innerJoin(service, eq(service.id, booking.serviceId))
		.innerJoin(organization, eq(organization.id, booking.organizationId))
		.where(
			and(
				eq(booking.customerUserId, customerUserId),
				eq(service.isActive, true),
				isNull(service.archivedAt),
			),
		)
		.groupBy(service.id, organization.id)
		.orderBy(desc(lastBookedAt), asc(service.id));
};

/** What a booking email needs, loaded after the change commits. */
export const findBookingEmailContext = async (bookingId: string) => {
	const [row] = await db
		.select({
			booking,
			serviceName: service.name,
			organization: {
				name: organization.name,
				slug: organization.slug,
				timezone: organization.timezone,
			},
		})
		.from(booking)
		.innerJoin(service, eq(service.id, booking.serviceId))
		.innerJoin(organization, eq(organization.id, booking.organizationId))
		.where(eq(booking.id, bookingId));
	return row ?? null;
};

export type BookingEmailContext = NonNullable<
	Awaited<ReturnType<typeof findBookingEmailContext>>
>;

const total = (
	column: SQL | typeof booking.priceMinor,
	where: SQL | undefined,
) =>
	sql<number>`coalesce(sum(${column}) filter (where ${where}), 0)::int`.mapWith(
		Number,
	);

const durationMinutes = sql`extract(epoch from ${booking.endsAt} - ${booking.startsAt}) / 60`;

/** Booked value and booked minutes of the bookings starting in `[start, end)`. */
export const sumBookingsBetween = async (
	organizationId: string,
	start: Date,
	end: Date,
) => {
	const [row] = await db
		.select({
			bookedMinor: total(
				booking.priceMinor,
				inArray(booking.status, ["confirmed", "completed"]),
			),
			completedMinor: total(
				booking.priceMinor,
				eq(booking.status, "completed"),
			),
			bookedMinutes: total(durationMinutes, ne(booking.status, "cancelled")),
		})
		.from(booking)
		.where(
			and(
				eq(booking.organizationId, organizationId),
				gte(booking.startsAt, start),
				lt(booking.startsAt, end),
			),
		);
	return row ?? { bookedMinor: 0, completedMinor: 0, bookedMinutes: 0 };
};

const upcomingRequests = (organizationId: string, now: Date) =>
	and(
		eq(booking.organizationId, organizationId),
		eq(booking.status, "pending"),
		gt(booking.startsAt, now),
	);

/** Requests still waiting for an answer, oldest request first. */
export const findPendingRequests = async (
	organizationId: string,
	now: Date,
	limit: number,
) => {
	const [rows, [counted]] = await Promise.all([
		db
			.select(withServiceName)
			.from(booking)
			.innerJoin(service, eq(service.id, booking.serviceId))
			.where(upcomingRequests(organizationId, now))
			.orderBy(asc(booking.createdAt), asc(booking.id))
			.limit(limit),
		db
			.select({ total: count() })
			.from(booking)
			.where(upcomingRequests(organizationId, now)),
	]);
	return { rows, total: counted?.total ?? 0 };
};

const countWhere = (where: SQL) =>
	sql<number>`count(*) filter (where ${where})::int`.mapWith(Number);

/** Started confirmed bookings with no outcome, and started requests nobody answered. */
export const countNeedingAttention = async (
	organizationId: string,
	now: Date,
) => {
	const [row] = await db
		.select({
			unresolved: countWhere(eq(booking.status, "confirmed")),
			expiredRequests: countWhere(eq(booking.status, "pending")),
		})
		.from(booking)
		.where(
			and(
				eq(booking.organizationId, organizationId),
				inArray(booking.status, ACTIVE_BOOKING_STATUSES),
				lte(booking.startsAt, now),
			),
		);
	return row ?? { unresolved: 0, expiredRequests: 0 };
};
