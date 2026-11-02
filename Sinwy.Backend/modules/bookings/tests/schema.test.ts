import { beforeEach, expect, test } from "bun:test";
import {
	createUserWithSession,
	insertOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { booking, bookingEvent } from "@db/schema/bookingSchema";
import { organization } from "@db/schema/organizationSchema";
import { service } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import { eq } from "drizzle-orm";

let orgId: string;
let serviceId: string;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Salon");
	serviceId = crypto.randomUUID();
	await db.insert(service).values({
		id: serviceId,
		organizationId: orgId,
		name: "Haircut",
		slug: "haircut",
		durationMinutes: 30,
		priceMinor: 2500,
		currency: "EUR",
	});
});

const startsAt = new Date("2026-11-03T10:00:00Z");

const insertBooking = (values: Partial<typeof booking.$inferInsert> = {}) =>
	db.insert(booking).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		serviceId,
		customerName: "Ana",
		customerPhone: "+370 600 00000",
		startsAt,
		endsAt: new Date(startsAt.getTime() + 30 * 60_000),
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 0,
		priceMinor: 2500,
		currency: "EUR",
		status: "confirmed",
		...values,
	});

const violation = async (query: PromiseLike<unknown>) => {
	const error = await query.then(
		() => null,
		(e: Error) => e,
	);
	const cause = error?.cause instanceof Error ? error.cause : error;
	return cause?.message ?? null;
};

test("a valid booking and its event are accepted", async () => {
	const id = crypto.randomUUID();
	expect(await violation(insertBooking({ id }))).toBeNull();
	expect(
		await violation(
			db.insert(bookingEvent).values({
				id: crypto.randomUUID(),
				bookingId: id,
				type: "created",
				toStatus: "confirmed",
				actorType: "member",
			}),
		),
	).toBeNull();
});

test.each([
	["a cancelled booking without cancelledBy", { status: "cancelled" }],
	[
		"cancelledBy on a booking that isn't cancelled",
		{ cancelledBy: "customer" },
	],
	[
		"no way to reach the customer",
		{ customerEmail: null, customerPhone: null, customerUserId: null },
	],
	["an unknown status", { status: "done" }],
	["an unknown canceller", { status: "cancelled", cancelledBy: "system" }],
	["an end before the start", { endsAt: startsAt }],
	["a negative price", { priceMinor: -1 }],
])("the database rejects %s", async (_label, override) => {
	expect(await violation(insertBooking(override))).toContain(
		"violates check constraint",
	);
});

test("a cancelled booking with cancelledBy and only an account to reach is accepted", async () => {
	const customer = await createUserWithSession();
	expect(
		await violation(
			insertBooking({
				status: "cancelled",
				cancelledBy: "organization",
				customerPhone: null,
				customerUserId: customer.userId,
			}),
		),
	).toBeNull();
});

test("the database rejects an unknown event type or actor", async () => {
	const id = crypto.randomUUID();
	await insertBooking({ id });
	const insertEvent = (values: Partial<typeof bookingEvent.$inferInsert>) =>
		db.insert(bookingEvent).values({
			id: crypto.randomUUID(),
			bookingId: id,
			type: "created",
			actorType: "member",
			...values,
		});
	expect(await violation(insertEvent({ type: "deleted" }))).toContain(
		"violates check constraint",
	);
	expect(await violation(insertEvent({ actorType: "robot" }))).toContain(
		"violates check constraint",
	);
});

test("a service with bookings can't be deleted, but its organization's cascade removes both", async () => {
	await insertBooking();
	expect(
		await violation(db.delete(service).where(eq(service.id, serviceId))),
	).toContain("foreign key constraint");

	await db.delete(organization).where(eq(organization.id, orgId));
	expect(await db.select({ id: booking.id }).from(booking)).toEqual([]);
});

test("deleting the customer's account keeps the booking without the link", async () => {
	const customer = await createUserWithSession();
	const id = crypto.randomUUID();
	await insertBooking({
		id,
		customerUserId: customer.userId,
		customerEmail: "ana@example.com",
	});
	await db.delete(user).where(eq(user.id, customer.userId));
	const [row] = await db
		.select({
			customerUserId: booking.customerUserId,
			customerEmail: booking.customerEmail,
		})
		.from(booking)
		.where(eq(booking.id, id));
	expect(row).toEqual({
		customerUserId: null,
		customerEmail: "ana@example.com",
	});
});
