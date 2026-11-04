import { beforeEach, expect, test } from "bun:test";
import type { Membership } from "@authModule";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { payment } from "@db/schema/paymentSchema";
import { service as serviceTable } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import { findBookableService } from "@servicesModule";
import { eq } from "drizzle-orm";
import {
	cancelCustomerBooking,
	cancelUpcomingOrganizationBookings,
	changeBookingStatus,
	createBooking,
	handleCustomerAccountDeleted,
	rescheduleBooking,
} from "../service";

type Session = { userId: string; cookie: string };

let orgId: string;
let owner: Session;
let customer: Session;
let membership: Membership;

const HOUR_MS = 60 * 60 * 1000;
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR_MS);

const addService = async (priceMinor: number) => {
	const id = crypto.randomUUID();
	await db.insert(serviceTable).values({
		id,
		organizationId: orgId,
		name: "Haircut",
		slug: id,
		durationMinutes: 30,
		priceMinor,
		currency: "EUR",
	});
	return id;
};

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	owner = await createUserWithSession();
	customer = await createUserWithSession();
	orgId = await insertOrganization("Salon");
	await joinOrganization(orgId, owner.userId, "owner");
	await activateOrganization(orgId);
	membership = {
		organizationId: orgId,
		roles: ["owner"],
		status: "active",
		plan: null,
	};
});

/** A self-booking by the customer, or a manual booking by the owner. */
const book = async (
	startsAt: Date,
	options: {
		by?: "customer" | "owner";
		priceMinor?: number;
		status?: "pending" | "confirmed";
	} = {},
) => {
	const service = await findBookableService(
		orgId,
		await addService(options.priceMinor ?? 2500),
	);
	if (!service) throw new Error("service missing");
	const self = options.by !== "owner";
	return createBooking({
		organizationId: orgId,
		service,
		startsAt,
		contact: {
			customerUserId: self ? customer.userId : null,
			customerName: "Bea",
			customerEmail: `${crypto.randomUUID()}@example.com`,
			customerPhone: null,
		},
		customerNote: null,
		internalNote: null,
		status: options.status ?? "confirmed",
		actor: self
			? { type: "customer", userId: customer.userId }
			: { type: "member", userId: owner.userId },
	});
};

const booked = async (...args: Parameters<typeof book>) => {
	const result = await book(...args);
	if (!result.ok) throw new Error(result.error);
	return result.data.id;
};

const paymentsOf = (bookingId: string) =>
	db
		.select({
			status: payment.status,
			amountMinor: payment.amountMinor,
			currency: payment.currency,
			provider: payment.provider,
			organizationId: payment.organizationId,
		})
		.from(payment)
		.where(eq(payment.bookingId, bookingId));

const statusOf = async (bookingId: string) =>
	(await paymentsOf(bookingId)).map((row) => row.status);

test("a manual booking and a self-booking each get one pending payment; a free one gets none", async () => {
	const manual = await booked(hoursFromNow(24), { by: "owner" });
	const self = await booked(hoursFromNow(48), { by: "customer" });
	const free = await booked(hoursFromNow(72), { priceMinor: 0 });

	for (const bookingId of [manual, self])
		expect(await paymentsOf(bookingId)).toEqual([
			{
				status: "pending",
				amountMinor: 2500,
				currency: "EUR",
				provider: "manual",
				organizationId: orgId,
			},
		]);
	expect(await paymentsOf(free)).toEqual([]);
});

test("every way of cancelling voids a pending payment", async () => {
	const byStaff = await booked(hoursFromNow(24));
	const byCustomer = await booked(hoursFromNow(26));
	expect(
		(await changeBookingStatus(membership, owner.userId, byStaff, "cancelled"))
			.ok,
	).toBe(true);
	expect((await cancelCustomerBooking(customer.userId, byCustomer)).ok).toBe(
		true,
	);
	expect(await statusOf(byStaff)).toEqual(["void"]);
	expect(await statusOf(byCustomer)).toEqual(["void"]);

	const closing = await booked(hoursFromNow(28));
	expect(await cancelUpcomingOrganizationBookings([orgId])).toBe(1);
	expect(await statusOf(closing)).toEqual(["void"]);

	const deleted = await booked(hoursFromNow(30));
	expect(await handleCustomerAccountDeleted(customer.userId)).toBe(1);
	expect(await statusOf(deleted)).toEqual(["void"]);
});

test("cancelling leaves a paid payment paid", async () => {
	const bookingId = await booked(hoursFromNow(24));
	await db
		.update(payment)
		.set({ status: "paid", paidAt: new Date() })
		.where(eq(payment.bookingId, bookingId));
	await changeBookingStatus(membership, owner.userId, bookingId, "cancelled");
	expect(await statusOf(bookingId)).toEqual(["paid"]);
});

test("confirming, completing, no-show and rescheduling leave the payment alone", async () => {
	const pending = await booked(hoursFromNow(24), { status: "pending" });
	expect(
		(await changeBookingStatus(membership, owner.userId, pending, "confirmed"))
			.ok,
	).toBe(true);
	expect(
		(
			await rescheduleBooking(membership, owner.userId, pending, {
				startsAt: hoursFromNow(50).toISOString(),
			})
		).ok,
	).toBe(true);
	expect(await statusOf(pending)).toEqual(["pending"]);

	const past = await booked(hoursFromNow(-3), { by: "owner" });
	expect(
		(await changeBookingStatus(membership, owner.userId, past, "completed")).ok,
	).toBe(true);
	expect(
		(await changeBookingStatus(membership, owner.userId, past, "no_show")).ok,
	).toBe(true);
	expect(await statusOf(past)).toEqual(["pending"]);
});

test("a refused booking leaves no payment, and deleting the organization removes its payments", async () => {
	const startsAt = hoursFromNow(24);
	await booked(startsAt);
	expect(await book(startsAt)).toEqual({ ok: false, error: "time-taken" });
	expect(await db.$count(payment)).toBe(1);

	await db.delete(organization).where(eq(organization.id, orgId));
	expect(await db.$count(payment)).toBe(0);
});

test("the database refuses a second payment per booking and unknown statuses or providers", async () => {
	const bookingId = await booked(hoursFromNow(24));
	const values = {
		organizationId: orgId,
		bookingId,
		amountMinor: 2500,
		currency: "EUR",
		status: "pending",
		provider: "manual",
	};
	const violation = async (query: PromiseLike<unknown>) => {
		const error = await query.then(
			() => null,
			(e: Error) => e,
		);
		const cause = error?.cause instanceof Error ? error.cause : error;
		return cause?.message ?? null;
	};
	const change = (set: Partial<typeof payment.$inferInsert>) =>
		db.update(payment).set(set).where(eq(payment.bookingId, bookingId));

	expect(
		await violation(
			db.insert(payment).values({ ...values, id: crypto.randomUUID() }),
		),
	).toContain("payment_booking_id_idx");
	expect(await violation(change({ status: "failed" }))).toContain(
		"payment_status_check",
	);
	expect(await violation(change({ provider: "stripe" }))).toContain(
		"payment_provider_check",
	);
	expect(await violation(change({ status: "paid" }))).toContain(
		"payment_paid_at_check",
	);
	expect(await statusOf(bookingId)).toEqual(["pending"]);
});
