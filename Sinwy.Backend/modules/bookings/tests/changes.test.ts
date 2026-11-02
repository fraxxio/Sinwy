import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import { emailClient, readOutboxEmails } from "@backend/infrastructure/email";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { booking, bookingEvent } from "@db/schema/bookingSchema";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { findBookableService, registerServiceRoutes } from "@servicesModule";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type BookingDetailDto,
	type BookingDto,
	type ServiceDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerBookingRoutes } from "../routes";
import { createBooking } from "../service";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerServiceRoutes(app);
	registerBookingRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

let orgId: string;
let ownerCookie: string;
let ownerId: string;
let serviceId: string;
let since: number;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Salon");
	const owner = await createUserWithSession();
	await joinOrganization(orgId, owner.userId, "owner");
	await activateOrganization(orgId);
	await db
		.update(organization)
		.set({ timezone: "Europe/Vilnius" })
		.where(eq(organization.id, orgId));
	({ cookie: ownerCookie, userId: ownerId } = owner);
	const service = await unwrap<ServiceDto>(
		await call("POST", "services", {
			name: "Haircut",
			durationMinutes: 30,
			priceMinor: 2500,
			bufferAfterMinutes: 10,
		}),
	);
	serviceId = service.id;
	since = Date.now();
});

const call = (method: string, path: string, body?: unknown) =>
	fetch(new URL(`/api/organizations/${orgId}/${path}`, base), {
		method,
		headers: { "content-type": "application/json", cookie: ownerCookie },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

const unwrap = async <T>(res: Response) => {
	const body = (await res.json()) as ApiResponse<T>;
	if (!body.isSuccess) throw new Error(`request failed: ${body.message}`);
	return body.data;
};

const errorCode = async (res: Response) =>
	((await res.json()) as ApiResponse<never>).code;

const FUTURE = "2099-03-01T10:00:00+02:00";
const PAST = "2020-03-01T10:00:00+02:00";

const book = async (
	startsAt = FUTURE,
	contact: Record<string, string> = {
		customerName: "Ana",
		customerPhone: "+370 600 00000",
	},
) =>
	unwrap<BookingDto>(
		await call("POST", "bookings", { serviceId, startsAt, ...contact }),
	);

/** A self-booking, as the storefront will create it. */
const selfBook = async (
	status: "pending" | "confirmed",
	email: string,
	startsAt = "2099-03-05T10:00:00+02:00",
) => {
	const customer = await createUserWithSession();
	const service = await findBookableService(orgId, serviceId);
	if (!service) throw new Error("service missing");
	const result = await createBooking({
		organizationId: orgId,
		service,
		startsAt: new Date(startsAt),
		contact: {
			customerUserId: customer.userId,
			customerName: "Bea",
			customerEmail: email,
			customerPhone: null,
		},
		customerNote: null,
		internalNote: null,
		status,
		actor: { type: "customer", userId: customer.userId },
	});
	if (!result.ok) throw new Error(result.error);
	return result.data;
};

const makePending = (bookingId: string) =>
	db
		.update(booking)
		.set({ status: "pending" })
		.where(eq(booking.id, bookingId));

const action = (bookingId: string, name: string, body?: unknown) =>
	call("POST", `bookings/${bookingId}/${name}`, body);

const detail = (bookingId: string) =>
	call("GET", `bookings/${bookingId}`).then(unwrap<BookingDetailDto>);

const statusEvents = (bookingId: string) =>
	db
		.select()
		.from(bookingEvent)
		.where(eq(bookingEvent.bookingId, bookingId))
		.then((rows) => rows.filter((row) => row.type === "status_changed"));

const sentTo = async (to: string) =>
	(await readOutboxEmails())
		.map(({ email }) => email)
		.filter((email) => email.to === to && Date.parse(email.sentAt) >= since);

const freshEmail = () => `${crypto.randomUUID()}@example.com`;

test("staff confirm a pending request and the history records who did it", async () => {
	const created = await book();
	await makePending(created.id);

	const res = await action(created.id, "confirm");
	expect(res.status).toBe(200);
	expect((await unwrap<BookingDto>(res)).status).toBe("confirmed");
	const { history } = await detail(created.id);
	expect(history.at(-1)).toMatchObject({
		type: "status_changed",
		fromStatus: "pending",
		toStatus: "confirmed",
		actorType: "member",
		actorName: "Test User",
	});
});

test("illegal transitions are 409 and change nothing", async () => {
	const future = await book();
	const past = await book(PAST);
	const pendingPast = await book("2020-03-02T10:00:00+02:00");
	await makePending(pendingPast.id);
	const cancelled = await book("2099-03-02T10:00:00+02:00");
	expect((await action(cancelled.id, "cancel", {})).status).toBe(200);

	const refused = [
		[future.id, "complete"],
		[future.id, "no-show"],
		[future.id, "confirm"],
		[past.id, "confirm"],
		[pendingPast.id, "confirm"],
		[pendingPast.id, "complete"],
		[cancelled.id, "confirm"],
		[cancelled.id, "cancel"],
		[cancelled.id, "complete"],
	] as const;
	for (const [id, name] of refused) {
		const res = await action(id, name, name === "cancel" ? {} : undefined);
		expect({ id, name, status: res.status }).toEqual({
			id,
			name,
			status: 409,
		});
		expect(await errorCode(res)).toBe(
			API_ERROR_CODES.BOOKING_STATUS_CHANGE_NOT_ALLOWED,
		);
	}
	expect((await detail(future.id)).status).toBe("confirmed");
	expect((await detail(cancelled.id)).history).toHaveLength(2);
});

test("a finished booking can be corrected between completed and no-show", async () => {
	const past = await book(PAST);
	for (const [name, status] of [
		["complete", "completed"],
		["no-show", "no_show"],
		["complete", "completed"],
	] as const) {
		const res = await action(past.id, name);
		expect((await unwrap<BookingDto>(res)).status).toBe(status);
	}
	expect(await statusEvents(past.id)).toHaveLength(3);
	expect((await action(past.id, "cancel", {})).status).toBe(409);
});

test("a decline records the organization and the reason, and emails the reason", async () => {
	const email = freshEmail();
	const created = await book(FUTURE, {
		customerName: "Ana",
		customerEmail: email,
	});
	await makePending(created.id);

	const res = await action(created.id, "cancel", { reason: " Fully booked " });
	expect(await unwrap<BookingDto>(res)).toMatchObject({
		status: "cancelled",
		cancelledBy: "organization",
		cancellationReason: "Fully booked",
	});
	const declined = (await sentTo(email)).find((e) =>
		e.subject.startsWith("Request declined"),
	);
	expect(declined?.html).toContain("Fully booked");
});

test("concurrent changes to one booking leave exactly one transition", async () => {
	const past = await book(PAST);
	const results = await Promise.all([
		action(past.id, "complete"),
		action(past.id, "cancel", {}),
	]);
	expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
	expect(await statusEvents(past.id)).toHaveLength(1);

	const pending = await book(FUTURE);
	await makePending(pending.id);
	const confirms = await Promise.all([
		action(pending.id, "confirm"),
		action(pending.id, "confirm"),
	]);
	expect(confirms.map((res) => res.status).sort()).toEqual([200, 409]);
	expect(await statusEvents(pending.id)).toHaveLength(1);
});

test("a reschedule keeps the length and refuses a taken window, but may overlap its own", async () => {
	const email = freshEmail();
	const first = await book("2099-03-01T10:00:00+02:00", {
		customerName: "Ana",
		customerEmail: email,
	});
	const second = await book("2099-03-01T11:00:00+02:00");

	const taken = await action(second.id, "reschedule", {
		startsAt: "2099-03-01T10:20:00+02:00",
	});
	expect(taken.status).toBe(409);
	expect(await errorCode(taken)).toBe(API_ERROR_CODES.BOOKING_TIME_TAKEN);

	const res = await action(first.id, "reschedule", {
		startsAt: "2099-03-01T10:15:00+02:00",
	});
	expect(await unwrap<BookingDto>(res)).toMatchObject({
		startsAt: "2099-03-01T08:15:00.000Z",
		endsAt: "2099-03-01T08:45:00.000Z",
		status: "confirmed",
		priceMinor: 2500,
		bufferAfterMinutes: 10,
	});
	const { history } = await detail(first.id);
	expect(history.at(-1)).toMatchObject({
		type: "rescheduled",
		payload: {
			previousStartsAt: "2099-03-01T08:00:00.000Z",
			startsAt: "2099-03-01T08:15:00.000Z",
		},
	});
	const moved = (await sentTo(email)).find((e) =>
		e.subject.startsWith("Booking moved"),
	);
	expect(moved?.html).toContain("10:00");
	expect(moved?.html).toContain("10:15");
});

test("only pending and confirmed bookings can be rescheduled", async () => {
	const past = await book(PAST);
	await action(past.id, "complete");
	const res = await action(past.id, "reschedule", { startsAt: FUTURE });
	expect(res.status).toBe(409);
});

test("staff edit a manual booking's contact, and the history lists the changed fields", async () => {
	const created = await book();
	const res = await call("PATCH", `bookings/${created.id}`, {
		customerName: "Ana",
		customerEmail: "",
		customerPhone: "+370 600 11111",
	});
	expect((await unwrap<BookingDto>(res)).customerPhone).toBe("+370 600 11111");
	const { history } = await detail(created.id);
	expect(history.at(-1)).toMatchObject({
		type: "contact_updated",
		payload: { fields: ["customerPhone"] },
	});

	const noContact = await call("PATCH", `bookings/${created.id}`, {
		customerName: "Ana",
		customerEmail: "",
		customerPhone: "",
	});
	expect(noContact.status).toBe(400);
});

test("note edits work on both kinds of booking and log nothing; a self-booking's contact is locked", async () => {
	const manual = await book();
	const self = await selfBook("confirmed", freshEmail());
	for (const id of [manual.id, self.id]) {
		const res = await call("PATCH", `bookings/${id}`, {
			internalNote: "Allergic to dye",
		});
		expect((await unwrap<BookingDto>(res)).internalNote).toBe(
			"Allergic to dye",
		);
		expect((await detail(id)).history).toHaveLength(1);
	}

	const locked = await call("PATCH", `bookings/${self.id}`, {
		customerName: "Someone else",
		customerEmail: "else@example.com",
		customerPhone: null,
	});
	expect(locked.status).toBe(409);
	expect((await detail(self.id)).customerName).toBe("Bea");
});

test("a manual booking emails the customer once, and only with an email", async () => {
	const email = freshEmail();
	await book(FUTURE, { customerName: "Ana", customerEmail: email });
	const emails = await sentTo(email);
	expect(emails.map((e) => e.subject)).toEqual([
		"Booking confirmed: Haircut at Salon",
	]);
	expect(emails[0]?.html).toContain(
		"Sunday 1 March 2099 at 10:00 (Europe/Vilnius)",
	);
	expect(emails[0]?.html).not.toContain("/account/bookings/");
	expect(await sentTo(`${ownerId}@test.dev`)).toEqual([]);

	const outboxIds = async () =>
		(await readOutboxEmails()).map(({ email: e }) => e.id);
	const before = await outboxIds();
	await book("2099-03-02T10:00:00+02:00");
	expect(await outboxIds()).toEqual(before);
});

test("self-bookings email the customer and the owner and admins, not staff", async () => {
	const admin = await createUserWithSession();
	const staff = await createUserWithSession();
	await joinOrganization(orgId, admin.userId, "admin");
	await joinOrganization(orgId, staff.userId, "staff");

	const email = freshEmail();
	const request = await selfBook("pending", email);
	expect((await sentTo(email)).map((e) => e.subject)).toEqual([
		"Request received: Haircut at Salon",
	]);
	for (const manager of [ownerId, admin.userId]) {
		const [received] = await sentTo(`${manager}@test.dev`);
		expect(received?.subject).toStartWith("New booking request: Haircut");
		expect(received?.html).toContain(`/bookings/${request.id}`);
	}
	expect(await sentTo(`${staff.userId}@test.dev`)).toEqual([]);

	await action(request.id, "confirm");
	const confirmed = (await sentTo(email)).find((e) =>
		e.subject.startsWith("Booking confirmed"),
	);
	expect(confirmed?.html).toContain(`/account/bookings/${request.id}`);
});

test("cancelling a confirmed booking sends the cancellation, not a decline", async () => {
	const email = freshEmail();
	const created = await book(FUTURE, {
		customerName: "Ana",
		customerEmail: email,
	});
	await action(created.id, "cancel", { reason: "Stylist is ill" });
	const subjects = (await sentTo(email)).map((e) => e.subject);
	expect(subjects).toContain("Booking cancelled: Haircut at Salon");
	expect(subjects.some((s) => s.startsWith("Request declined"))).toBe(false);
});

test("a failing email still returns 200 and keeps the change", async () => {
	const created = await book(FUTURE, {
		customerName: "Ana",
		customerEmail: freshEmail(),
	});
	await makePending(created.id);
	const send = spyOn(emailClient, "send").mockRejectedValue(new Error("down"));
	try {
		const res = await action(created.id, "confirm");
		expect(res.status).toBe(200);
		expect(send).toHaveBeenCalled();
	} finally {
		send.mockRestore();
	}
	const [row] = await db
		.select({ status: booking.status })
		.from(booking)
		.where(eq(booking.id, created.id));
	expect(row?.status).toBe("confirmed");
});

test("an inactive organization refuses every write", async () => {
	const created = await book();
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));

	const writes = [
		action(created.id, "confirm"),
		action(created.id, "cancel", {}),
		action(created.id, "complete"),
		action(created.id, "no-show"),
		action(created.id, "reschedule", { startsAt: FUTURE }),
		call("PATCH", `bookings/${created.id}`, { internalNote: "x" }),
	];
	for (const res of await Promise.all(writes)) {
		expect(res.status).toBe(409);
		expect(await errorCode(res)).toBe(API_ERROR_CODES.ORGANIZATION_INACTIVE);
	}
});

test("another organization's booking is 404", async () => {
	const created = await book();
	const otherOrg = await insertOrganization("Other");
	await joinOrganization(otherOrg, ownerId, "owner");
	await activateOrganization(otherOrg);
	const res = await fetch(
		new URL(
			`/api/organizations/${otherOrg}/bookings/${created.id}/cancel`,
			base,
		),
		{
			method: "POST",
			headers: { "content-type": "application/json", cookie: ownerCookie },
			body: "{}",
		},
	);
	expect(res.status).toBe(404);
});
