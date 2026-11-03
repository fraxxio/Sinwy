import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import { readOutboxEmails } from "@backend/infrastructure/email";
import { polarClient } from "@backend/infrastructure/polar";
import { purgeOrganizationsJob } from "@backend/jobs";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
	polarPages,
	stubPolarCore,
} from "@backend/test/helpers";
import db from "@db";
import { verification } from "@db/schema/authSchema";
import { booking, bookingEvent } from "@db/schema/bookingSchema";
import { member, organization } from "@db/schema/organizationSchema";
import { service as serviceTable } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import { findBookableService } from "@servicesModule";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import {
	countUpcomingCustomerBookings,
	countUpcomingOrganizationBookings,
	createBooking,
	ORGANIZATION_CLOSED_REASON,
} from "../service";

let server: Server<never>;
let base: URL;
let listSpy: ReturnType<typeof spyOn>;
let polarCoreSpy: ReturnType<typeof stubPolarCore>;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	server = app.listen(0);
	base = server.url;
	listSpy = spyOn(polarClient.subscriptions, "iterList");
	listSpy.mockImplementation(polarPages([]));
	polarCoreSpy = stubPolarCore();
});

afterAll(() => {
	listSpy.mockRestore();
	polarCoreSpy.mockRestore();
	server.stop(true);
});

type Session = { userId: string; cookie: string };

let orgId: string;
let owner: Session;
let customer: Session;
let serviceId: string;
let since: number;

const addService = async (organizationId: string) => {
	const id = crypto.randomUUID();
	await db.insert(serviceTable).values({
		id,
		organizationId,
		name: "Haircut",
		slug: id,
		durationMinutes: 30,
		priceMinor: 2500,
		currency: "EUR",
	});
	return id;
};

const addOrganization = async (name: string, ownerUserId: string) => {
	const id = await insertOrganization(name);
	await joinOrganization(id, ownerUserId, "owner");
	await activateOrganization(id);
	await db
		.update(organization)
		.set({ timezone: "Europe/Vilnius" })
		.where(eq(organization.id, id));
	return id;
};

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	owner = await createUserWithSession();
	orgId = await addOrganization("Salon", owner.userId);
	serviceId = await addService(orgId);
	customer = await createUserWithSession();
	since = Date.now();
});

const HOUR_MS = 60 * 60 * 1000;
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR_MS);

const freshEmail = () => `${crypto.randomUUID()}@example.com`;

/** A self-booking by `by`, or a manual booking with no account when `by` is null. */
const book = async (
	startsAt: Date,
	options: {
		by?: Session | null;
		email?: string;
		status?: "pending" | "confirmed";
		windowMinutes?: number;
		organizationId?: string;
		serviceId?: string;
	} = {},
) => {
	const organizationId = options.organizationId ?? orgId;
	const service = await findBookableService(
		organizationId,
		options.serviceId ?? serviceId,
	);
	if (!service) throw new Error("service missing");
	const by = options.by === undefined ? customer : options.by;
	const result = await createBooking({
		organizationId,
		service: {
			...service,
			cancellationWindowMinutes: options.windowMinutes ?? 0,
		},
		startsAt,
		contact: {
			customerUserId: by?.userId ?? null,
			customerName: "Bea",
			customerEmail: options.email ?? freshEmail(),
			customerPhone: null,
		},
		customerNote: null,
		internalNote: null,
		status: options.status ?? "confirmed",
		actor: by
			? { type: "customer", userId: by.userId }
			: { type: "member", userId: owner.userId },
	});
	if (!result.ok) throw new Error(result.error);
	return result.data;
};

const rowOf = async (bookingId: string) => {
	const [row] = await db
		.select({
			status: booking.status,
			cancelledBy: booking.cancelledBy,
			cancellationReason: booking.cancellationReason,
			customerUserId: booking.customerUserId,
			customerName: booking.customerName,
			customerEmail: booking.customerEmail,
		})
		.from(booking)
		.where(eq(booking.id, bookingId));
	return row;
};

const lastEventOf = async (bookingId: string) => {
	const events = await db
		.select({
			toStatus: bookingEvent.toStatus,
			actorType: bookingEvent.actorType,
		})
		.from(bookingEvent)
		.where(eq(bookingEvent.bookingId, bookingId))
		.orderBy(bookingEvent.occurredAt);
	return events.at(-1);
};

const sentTo = async (to: string) =>
	(await readOutboxEmails())
		.map(({ email }) => email)
		.filter((email) => email.to === to && Date.parse(email.sentAt) >= since);

/** Clicks the emailed account deletion link, as `deleteUserCallback.test.ts` does. */
const deleteAccount = async (as: Session) => {
	const token = `delete_${as.userId}`;
	const now = new Date();
	await db.insert(verification).values({
		id: `verification_${token}`,
		identifier: `delete-account-${token}`,
		value: as.userId,
		expiresAt: new Date(Date.now() + HOUR_MS),
		createdAt: now,
		updatedAt: now,
	});
	const url = new URL("/api/auth/delete-user/callback", base);
	url.searchParams.set("token", token);
	url.searchParams.set("callbackURL", "/auth/goodbye");
	const res = await fetch(url, {
		headers: { cookie: as.cookie },
		redirect: "manual",
	});
	expect(res.headers.get("location")).toBe("/auth/goodbye");
};

test("owner account deletion cancels the closing org's upcoming bookings, leaves past ones and emails the customers", async () => {
	const selfEmail = freshEmail();
	const manualEmail = freshEmail();
	const upcoming = await book(hoursFromNow(24), { email: selfEmail });
	const pending = await book(hoursFromNow(30), {
		status: "pending",
		email: selfEmail,
	});
	const manual = await book(hoursFromNow(48), {
		by: null,
		email: manualEmail,
	});
	const past = await book(hoursFromNow(-3));
	const otherOwner = await createUserWithSession();
	const otherOrgId = await addOrganization("Barber", otherOwner.userId);
	const ownBooking = await book(hoursFromNow(24), {
		by: owner,
		organizationId: otherOrgId,
		serviceId: await addService(otherOrgId),
	});

	await deleteAccount(owner);

	for (const { id } of [upcoming, pending, manual]) {
		expect(await rowOf(id)).toMatchObject({
			status: "cancelled",
			cancelledBy: "organization",
			cancellationReason: ORGANIZATION_CLOSED_REASON,
		});
		expect(await lastEventOf(id)).toEqual({
			toStatus: "cancelled",
			actorType: "system",
		});
	}
	expect((await rowOf(past.id))?.status).toBe("confirmed");
	expect(await rowOf(ownBooking.id)).toMatchObject({
		status: "cancelled",
		cancelledBy: "customer",
		customerUserId: null,
	});

	const toSelf = await sentTo(selfEmail);
	expect(
		toSelf.filter((e) => e.subject.startsWith("Booking cancelled:")),
	).toHaveLength(2);
	const [toManual] = (await sentTo(manualEmail)).filter((e) =>
		e.subject.startsWith("Booking cancelled:"),
	);
	expect(toManual?.html).toContain(ORGANIZATION_CLOSED_REASON);
	expect(toManual?.html).not.toContain("/account/bookings/");
});

test("the purge repair cancels the upcoming bookings of an ownerless org it schedules for deletion", async () => {
	const email = freshEmail();
	const upcoming = await book(hoursFromNow(24), { email });
	await db.delete(member).where(eq(member.organizationId, orgId));
	await db
		.update(organization)
		.set({ createdAt: hoursFromNow(-48) })
		.where(eq(organization.id, orgId));

	expect((await purgeOrganizationsJob.run()).scheduled).toBe(1);

	expect(await rowOf(upcoming.id)).toMatchObject({
		status: "cancelled",
		cancelledBy: "organization",
		cancellationReason: ORGANIZATION_CLOSED_REASON,
	});
	expect(
		(await sentTo(email)).filter((e) =>
			e.subject.startsWith("Booking cancelled:"),
		),
	).toHaveLength(1);
});

test("immediate org deletion emails the customers, then the cascade removes the bookings", async () => {
	const email = freshEmail();
	const upcoming = await book(hoursFromNow(24), { email });
	const past = await book(hoursFromNow(-3), { email });

	const res = await fetch(new URL("/api/auth/organization/delete", base), {
		method: "POST",
		headers: { "content-type": "application/json", cookie: owner.cookie },
		body: JSON.stringify({ organizationId: orgId }),
	});

	expect(res.status).toBe(200);
	const cancelled = (await sentTo(email)).filter((e) =>
		e.subject.startsWith("Booking cancelled:"),
	);
	expect(cancelled).toHaveLength(1);
	expect(cancelled[0]?.html).toContain(ORGANIZATION_CLOSED_REASON);
	expect(await rowOf(upcoming.id)).toBeUndefined();
	expect(await rowOf(past.id)).toBeUndefined();
});

test("customer account deletion cancels their upcoming bookings as the customer, even inside the window, and keeps the snapshot", async () => {
	const email = freshEmail();
	const insideWindow = await book(hoursFromNow(2), {
		email,
		windowMinutes: 24 * 60,
	});
	const pending = await book(hoursFromNow(48), { email, status: "pending" });
	const past = await book(hoursFromNow(-3), { email });
	const someoneElse = await book(hoursFromNow(72), {
		by: await createUserWithSession(),
	});

	await deleteAccount(customer);

	for (const { id } of [insideWindow, pending])
		expect(await rowOf(id)).toMatchObject({
			status: "cancelled",
			cancelledBy: "customer",
			customerUserId: null,
			customerName: "Bea",
			customerEmail: email,
		});
	expect(await rowOf(past.id)).toMatchObject({
		status: "confirmed",
		customerUserId: null,
	});
	expect((await rowOf(someoneElse.id))?.status).toBe("confirmed");

	const toOrg = (await sentTo(`${owner.userId}@test.dev`)).filter((e) =>
		e.subject.startsWith("Booking cancelled by customer"),
	);
	expect(toOrg).toHaveLength(2);
	expect(
		(await sentTo(email)).filter((e) =>
			e.subject.startsWith("Cancellation confirmed"),
		),
	).toEqual([]);
});

test("the deletion count is the org's pending and confirmed bookings that haven't started", async () => {
	await book(hoursFromNow(24));
	await book(hoursFromNow(30), { status: "pending" });
	await book(hoursFromNow(-3));
	await book(hoursFromNow(-30), { status: "pending" });
	const cancelled = await book(hoursFromNow(40));
	await db
		.update(booking)
		.set({ status: "cancelled", cancelledBy: "customer" })
		.where(eq(booking.id, cancelled.id));
	const otherOrgId = await addOrganization(
		"Barber",
		(await createUserWithSession()).userId,
	);
	await book(hoursFromNow(24), {
		organizationId: otherOrgId,
		serviceId: await addService(otherOrgId),
	});

	const counts = await countUpcomingOrganizationBookings([orgId]);

	expect([...counts]).toEqual([[orgId, 2]]);
});

test("the customer's deletion count is their own pending and confirmed bookings that haven't started", async () => {
	await book(hoursFromNow(24));
	await book(hoursFromNow(30), { status: "pending" });
	await book(hoursFromNow(-3));
	await book(hoursFromNow(36), {
		by: null,
		email: `${customer.userId}@test.dev`,
	});
	const otherOrgId = await addOrganization(
		"Barber",
		(await createUserWithSession()).userId,
	);
	const cancelled = await book(hoursFromNow(48), {
		organizationId: otherOrgId,
		serviceId: await addService(otherOrgId),
	});
	await db
		.update(booking)
		.set({ status: "cancelled", cancelledBy: "customer" })
		.where(eq(booking.id, cancelled.id));

	expect(await countUpcomingCustomerBookings(customer.userId)).toBe(2);
});
