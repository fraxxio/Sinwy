import db, { type Tx } from "@db";
import { booking } from "@db/schema/bookingSchema";
import { organization } from "@db/schema/organizationSchema";
import { payment } from "@db/schema/paymentSchema";
import { service } from "@db/schema/serviceSchema";
import { and, count, desc, eq, gte, lt, ne, type SQL, sql } from "drizzle-orm";

type PricedBooking = Pick<
	typeof booking.$inferSelect,
	"id" | "organizationId" | "priceMinor" | "currency"
>;

/** Free bookings get no payment. */
export const createBookingPayment = async (tx: Tx, row: PricedBooking) => {
	if (row.priceMinor === 0) return;
	await tx.insert(payment).values({
		id: crypto.randomUUID(),
		organizationId: row.organizationId,
		bookingId: row.id,
		amountMinor: row.priceMinor,
		currency: row.currency,
		status: "pending",
		provider: "manual",
	});
};

/** Only a pending payment is voided; a paid one stays paid until refunds exist. */
export const voidBookingPayment = async (tx: Tx, bookingId: string) => {
	await tx
		.update(payment)
		.set({ status: "void", updatedAt: new Date() })
		.where(
			and(eq(payment.bookingId, bookingId), eq(payment.status, "pending")),
		);
};

export type PaymentRange = { start: Date; end: Date };

const inRange = (organizationId: string, range: PaymentRange) =>
	and(
		eq(payment.organizationId, organizationId),
		gte(payment.createdAt, range.start),
		lt(payment.createdAt, range.end),
	);

const paymentFields = {
	payment,
	customerName: booking.customerName,
	serviceName: service.name,
	startsAt: booking.startsAt,
};

export type PaymentRow = Awaited<ReturnType<typeof findPayments>>[number];

/** Newest first; without `page`, the whole range (the CSV export). */
export const findPayments = (
	organizationId: string,
	range: PaymentRange,
	page?: { limit: number; offset: number },
) => {
	const query = db
		.select(paymentFields)
		.from(payment)
		.innerJoin(booking, eq(booking.id, payment.bookingId))
		.innerJoin(service, eq(service.id, booking.serviceId))
		.where(inRange(organizationId, range))
		.orderBy(desc(payment.createdAt), desc(payment.id))
		.$dynamic();
	return page ? query.limit(page.limit).offset(page.offset) : query;
};

export const countPayments = async (
	organizationId: string,
	range: PaymentRange,
) => {
	const [row] = await db
		.select({ total: count() })
		.from(payment)
		.where(inRange(organizationId, range));
	return row?.total ?? 0;
};

const sumWhere = (condition: SQL) =>
	sql<number>`coalesce(sum(${payment.amountMinor}) filter (where ${condition}), 0)`.mapWith(
		Number,
	);

export const sumPayments = (organizationId: string, range: PaymentRange) =>
	db
		.select({
			currency: payment.currency,
			paidMinor: sumWhere(eq(payment.status, "paid")),
			pendingMinor: sumWhere(eq(payment.status, "pending")),
			count:
				sql<number>`count(*) filter (where ${ne(payment.status, "void")})`.mapWith(
					Number,
				),
		})
		.from(payment)
		.where(inRange(organizationId, range))
		.groupBy(payment.currency)
		.having(sql`count(*) filter (where ${ne(payment.status, "void")}) > 0`)
		.orderBy(payment.currency);

/** Pending → paid in one conditional update; null when the payment isn't pending in this organization. */
export const markPaymentPaid = async (
	organizationId: string,
	paymentId: string,
	now: Date,
) => {
	const [row] = await db
		.update(payment)
		.set({ status: "paid", paidAt: now, updatedAt: now })
		.where(
			and(
				eq(payment.id, paymentId),
				eq(payment.organizationId, organizationId),
				eq(payment.status, "pending"),
			),
		)
		.returning({ id: payment.id });
	return row ?? null;
};

export const paymentExists = async (
	organizationId: string,
	paymentId: string,
) => {
	const [row] = await db
		.select({ id: payment.id })
		.from(payment)
		.where(
			and(
				eq(payment.id, paymentId),
				eq(payment.organizationId, organizationId),
			),
		);
	return Boolean(row);
};

export const findPayment = async (
	organizationId: string,
	paymentId: string,
) => {
	const [row] = await db
		.select(paymentFields)
		.from(payment)
		.innerJoin(booking, eq(booking.id, payment.bookingId))
		.innerJoin(service, eq(service.id, booking.serviceId))
		.where(
			and(
				eq(payment.id, paymentId),
				eq(payment.organizationId, organizationId),
			),
		);
	return row ?? null;
};

/** What the "payment recorded" email shows. */
export const findPaymentNotice = async (
	organizationId: string,
	paymentId: string,
) => {
	const [row] = await db
		.select({
			amountMinor: payment.amountMinor,
			currency: payment.currency,
			bookingId: payment.bookingId,
			customerName: booking.customerName,
			serviceName: service.name,
			startsAt: booking.startsAt,
			organization: {
				name: organization.name,
				slug: organization.slug,
				timezone: organization.timezone,
			},
		})
		.from(payment)
		.innerJoin(booking, eq(booking.id, payment.bookingId))
		.innerJoin(service, eq(service.id, booking.serviceId))
		.innerJoin(organization, eq(organization.id, payment.organizationId))
		.where(
			and(
				eq(payment.id, paymentId),
				eq(payment.organizationId, organizationId),
			),
		);
	return row ?? null;
};

const customerPaymentFields = {
	...paymentFields,
	organization: {
		name: organization.name,
		slug: organization.slug,
		timezone: organization.timezone,
	},
};

export type CustomerPaymentRow = NonNullable<
	Awaited<ReturnType<typeof findCustomerPayment>>
>;

const ownedBy = (customerUserId: string) =>
	and(eq(booking.customerUserId, customerUserId), ne(payment.status, "void"));

const customerPayments = () =>
	db
		.select(customerPaymentFields)
		.from(payment)
		.innerJoin(booking, eq(booking.id, payment.bookingId))
		.innerJoin(service, eq(service.id, booking.serviceId))
		.innerJoin(organization, eq(organization.id, payment.organizationId));

export const findCustomerPayments = (
	customerUserId: string,
	page: { limit: number; offset: number },
) =>
	customerPayments()
		.where(ownedBy(customerUserId))
		.orderBy(desc(payment.createdAt), desc(payment.id))
		.limit(page.limit)
		.offset(page.offset);

export const countCustomerPayments = async (customerUserId: string) => {
	const [row] = await db
		.select({ total: count() })
		.from(payment)
		.innerJoin(booking, eq(booking.id, payment.bookingId))
		.where(ownedBy(customerUserId));
	return row?.total ?? 0;
};

export const findCustomerPayment = async (
	customerUserId: string,
	paymentId: string,
) => {
	const [row] = await customerPayments().where(
		and(ownedBy(customerUserId), eq(payment.id, paymentId)),
	);
	return row ?? null;
};
