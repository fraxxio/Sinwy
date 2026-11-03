import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import { readOutboxEmails } from "@backend/infrastructure/email";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { booking } from "@db/schema/bookingSchema";
import {
	organization,
	organizationProfile,
} from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { findBookableService, registerServiceRoutes } from "@servicesModule";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type BookingDto,
	type CustomerBookingDetailDto,
	type CustomerBookingDto,
	type CustomerBookingListDto,
	type ServiceDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerAccountBookingRoutes, registerBookingRoutes } from "../routes";
import { createBooking } from "../service";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerServiceRoutes(app);
	registerBookingRoutes(app);
	registerAccountBookingRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

type Session = { userId: string; cookie: string };

let orgId: string;
let owner: Session;
let customer: Session;
let customerEmail: string;
let serviceId: string;
let since: number;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Salon");
	owner = await createUserWithSession();
	await joinOrganization(orgId, owner.userId, "owner");
	await activateOrganization(orgId);
	await db
		.update(organization)
		.set({ timezone: "Europe/Vilnius" })
		.where(eq(organization.id, orgId));
	await db.insert(organizationProfile).values({
		organizationId: orgId,
		city: "Vilnius",
		country: "LT",
		phone: "+370 600 11111",
		email: "salon@example.com",
	});
	const service = await unwrap<ServiceDto>(
		await staff("POST", "services", {
			name: "Haircut",
			durationMinutes: 30,
			priceMinor: 2500,
		}),
	);
	serviceId = service.id;
	customer = await createUserWithSession();
	customerEmail = `${crypto.randomUUID()}@example.com`;
	since = Date.now();
});

const request = (
	cookie: string,
	method: string,
	path: string,
	body?: unknown,
) =>
	fetch(new URL(path, base), {
		method,
		headers: { "content-type": "application/json", cookie },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

const staff = (method: string, path: string, body?: unknown) =>
	request(owner.cookie, method, `/api/organizations/${orgId}/${path}`, body);

const account = (as: Session, method: string, path = "") =>
	request(as.cookie, method, `/api/account/bookings${path}`);

const unwrap = async <T>(res: Response) => {
	const body = (await res.json()) as ApiResponse<T>;
	if (!body.isSuccess) throw new Error(`request failed: ${body.message}`);
	return body.data;
};

const errorCode = async (res: Response) =>
	((await res.json()) as ApiResponse<never>).code;

const HOUR_MS = 60 * 60 * 1000;
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR_MS);

/** A self-booking by `customer`, as the storefront makes it. */
const selfBook = async (
	startsAt: Date,
	options: {
		status?: "pending" | "confirmed";
		windowMinutes?: number;
		by?: Session;
	} = {},
) => {
	const service = await findBookableService(orgId, serviceId);
	if (!service) throw new Error("service missing");
	const by = options.by ?? customer;
	const result = await createBooking({
		organizationId: orgId,
		service: {
			...service,
			cancellationWindowMinutes: options.windowMinutes ?? 0,
		},
		startsAt,
		contact: {
			customerUserId: by.userId,
			customerName: "Bea",
			customerEmail,
			customerPhone: null,
		},
		customerNote: "Short please",
		internalNote: null,
		status: options.status ?? "confirmed",
		actor: { type: "customer", userId: by.userId },
	});
	if (!result.ok) throw new Error(result.error);
	return result.data;
};

const list = (as: Session, tab: "upcoming" | "past" = "upcoming") =>
	account(as, "GET", `?tab=${tab}`).then(unwrap<CustomerBookingListDto>);

const cancel = (as: Session, bookingId: string) =>
	account(as, "POST", `/${bookingId}/cancel`);

const statusOf = async (bookingId: string) => {
	const [row] = await db
		.select({ status: booking.status, cancelledBy: booking.cancelledBy })
		.from(booking)
		.where(eq(booking.id, bookingId));
	return row;
};

const sentTo = async (to: string) =>
	(await readOutboxEmails())
		.map(({ email }) => email)
		.filter((email) => email.to === to && Date.parse(email.sentAt) >= since);

test("customers see only their own bookings, with the organization's location and contacts", async () => {
	const own = await selfBook(hoursFromNow(48));
	const other = await createUserWithSession();
	await selfBook(hoursFromNow(72), { by: other });
	const manual = await unwrap<BookingDto>(
		await staff("POST", "bookings", {
			serviceId,
			startsAt: hoursFromNow(96).toISOString(),
			customerName: "Bea",
			customerEmail: `${customer.userId}@test.dev`,
		}),
	);
	expect(manual.customerUserId).toBeNull();

	const { items, total } = await list(customer);
	expect(total).toBe(1);
	expect(items.map((item) => item.id)).toEqual([own.id]);
	expect(items[0]?.organization).toEqual({
		name: "Salon",
		slug: expect.any(String),
		timezone: "Europe/Vilnius",
		city: "Vilnius",
		country: "LT",
		phone: "+370 600 11111",
		email: "salon@example.com",
	});
	expect((await list(owner)).total).toBe(0);
});

test("another user's booking is 404 to read and to cancel", async () => {
	const created = await selfBook(hoursFromNow(48));
	const other = await createUserWithSession();

	expect((await account(other, "GET", `/${created.id}`)).status).toBe(404);
	expect((await cancel(other, created.id)).status).toBe(404);
	expect((await account(customer, "GET", "/missing")).status).toBe(404);
	expect((await statusOf(created.id))?.status).toBe("confirmed");
});

test("the customer's JSON has no internal note, contact snapshot, member names or contact edits", async () => {
	const created = await selfBook(hoursFromNow(48), { status: "pending" });
	expect(
		(
			await staff("PATCH", `bookings/${created.id}`, {
				internalNote: "Secret staff note",
			})
		).status,
	).toBe(200);
	expect((await staff("POST", `bookings/${created.id}/confirm`)).status).toBe(
		200,
	);
	const [ownerRow] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, owner.userId));

	const listJson = await (await account(customer, "GET")).text();
	const detailRes = await account(customer, "GET", `/${created.id}`);
	const detailJson = await detailRes.text();
	for (const json of [listJson, detailJson]) {
		expect(json).not.toContain("internalNote");
		expect(json).not.toContain("Secret staff note");
		expect(json).not.toContain("customerEmail");
		expect(json).not.toContain(customerEmail);
		expect(json).not.toContain(ownerRow?.name ?? "missing owner");
	}

	const detail = (
		JSON.parse(detailJson) as ApiResponse<CustomerBookingDetailDto>
	).data as CustomerBookingDetailDto;
	expect(detail.customerNote).toBe("Short please");
	expect(
		detail.history.map(({ type, actor, toStatus }) => ({
			type,
			actor,
			toStatus,
		})),
	).toEqual([
		{ type: "created", actor: "customer", toStatus: "pending" },
		{ type: "status_changed", actor: "organization", toStatus: "confirmed" },
	]);
});

test("a reschedule shows in the timeline with only its old and new start", async () => {
	const created = await selfBook(hoursFromNow(48));
	const moved = hoursFromNow(50);
	expect(
		(
			await staff("POST", `bookings/${created.id}/reschedule`, {
				startsAt: moved.toISOString(),
			})
		).status,
	).toBe(200);

	const detail = await unwrap<CustomerBookingDetailDto>(
		await account(customer, "GET", `/${created.id}`),
	);
	expect(detail.startsAt).toBe(moved.toISOString());
	expect(detail.history[1]).toEqual({
		id: expect.any(String),
		type: "rescheduled",
		fromStatus: null,
		toStatus: null,
		actor: "organization",
		moved: { from: created.startsAt, to: moved.toISOString() },
		occurredAt: expect.any(String),
	});
});

test("a customer cancel emails both sides, moves the booking to Past and shows as theirs", async () => {
	const created = await selfBook(hoursFromNow(48), { windowMinutes: 1440 });
	expect((await list(customer)).total).toBe(1);

	const res = await cancel(customer, created.id);
	expect(res.status).toBe(200);
	const cancelled = await unwrap<CustomerBookingDto>(res);
	expect(cancelled.status).toBe("cancelled");
	expect(cancelled.cancelledBy).toBe("customer");
	expect(cancelled.organization.city).toBe("Vilnius");

	expect((await list(customer)).total).toBe(0);
	expect((await list(customer, "past")).items.map((item) => item.id)).toEqual([
		created.id,
	]);
	const detail = await unwrap<CustomerBookingDetailDto>(
		await account(customer, "GET", `/${created.id}`),
	);
	expect(detail.history.at(-1)).toMatchObject({
		type: "status_changed",
		toStatus: "cancelled",
		actor: "customer",
	});

	const customerMail = await sentTo(customerEmail);
	expect(
		customerMail.some((mail) =>
			mail.subject.startsWith("Cancellation confirmed"),
		),
	).toBe(true);
	const [ownerRow] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, owner.userId));
	const ownerMail = await sentTo(ownerRow?.email ?? "");
	expect(
		ownerMail.some((mail) =>
			mail.subject.startsWith("Booking cancelled by customer"),
		),
	).toBe(true);
});

test("a started or cancelled booking can't be cancelled by the customer", async () => {
	const started = await selfBook(hoursFromNow(-0.25));
	const res = await cancel(customer, started.id);
	expect(res.status).toBe(409);
	expect(await errorCode(res)).toBe(
		API_ERROR_CODES.BOOKING_STATUS_CHANGE_NOT_ALLOWED,
	);

	const upcoming = await selfBook(hoursFromNow(48));
	expect((await cancel(customer, upcoming.id)).status).toBe(200);
	const again = await cancel(customer, upcoming.id);
	expect(again.status).toBe(409);
	expect(await errorCode(again)).toBe(
		API_ERROR_CODES.BOOKING_STATUS_CHANGE_NOT_ALLOWED,
	);
});

test("inside the window a confirmed booking stays, but a pending request can be withdrawn", async () => {
	const confirmed = await selfBook(hoursFromNow(2), { windowMinutes: 1440 });
	const before = await readOutboxEmails();
	const res = await cancel(customer, confirmed.id);
	expect(res.status).toBe(409);
	expect(await errorCode(res)).toBe(
		API_ERROR_CODES.BOOKING_CANCELLATION_WINDOW_PASSED,
	);
	expect(await statusOf(confirmed.id)).toEqual({
		status: "confirmed",
		cancelledBy: null,
	});
	expect((await readOutboxEmails()).length).toBe(before.length);

	const pending = await selfBook(hoursFromNow(4), {
		status: "pending",
		windowMinutes: 1440,
	});
	expect((await cancel(customer, pending.id)).status).toBe(200);
	expect(await statusOf(pending.id)).toEqual({
		status: "cancelled",
		cancelledBy: "customer",
	});
});

test("a booking at an inactive organization can still be read and cancelled", async () => {
	const created = await selfBook(hoursFromNow(48));
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));
	expect((await staff("POST", `bookings/${created.id}/confirm`)).status).toBe(
		409,
	);

	expect((await account(customer, "GET", `/${created.id}`)).status).toBe(200);
	expect((await cancel(customer, created.id)).status).toBe(200);
	expect((await statusOf(created.id))?.status).toBe("cancelled");
});

test("an organization scheduled for deletion refuses the customer cancel", async () => {
	const created = await selfBook(hoursFromNow(48));
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));

	expect((await cancel(customer, created.id)).status).toBe(409);
	expect((await statusOf(created.id))?.status).toBe("confirmed");
});

test("upcoming lists soonest first, past newest first, 20 a page", async () => {
	const later = await selfBook(hoursFromNow(72));
	const sooner = await selfBook(hoursFromNow(48));
	const past = await selfBook(hoursFromNow(-48));
	const older = await selfBook(hoursFromNow(-72));

	expect((await list(customer)).items.map((item) => item.id)).toEqual([
		sooner.id,
		later.id,
	]);
	expect((await list(customer, "past")).items.map((item) => item.id)).toEqual([
		past.id,
		older.id,
	]);
	expect((await account(customer, "GET", "?page=2")).status).toBe(200);
	expect((await account(customer, "GET", "?tab=nope")).status).toBe(400);
	expect(
		(
			await account(customer, "GET", "?page=2").then(
				unwrap<CustomerBookingListDto>,
			)
		).items,
	).toEqual([]);
});

test("the account routes need a session", async () => {
	expect((await fetch(new URL("/api/account/bookings", base))).status).toBe(
		401,
	);
});
