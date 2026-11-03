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
import { booking, bookingEvent } from "@db/schema/bookingSchema";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { registerServiceRoutes, todayIn } from "@servicesModule";
import {
	API_ERROR_CODES,
	type ApiResponse,
	BOOKING_LIMITS,
	type BookableTimesDto,
	type CustomerBookingDto,
	type ServiceDto,
	type StorefrontDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerBookingRoutes, registerStorefrontRoutes } from "../routes";
import { addDaysToDate, startOfLocalDate } from "../utils";

const TIMEZONE = "Europe/Vilnius";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerServiceRoutes(app);
	registerBookingRoutes(app);
	registerStorefrontRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

let orgId: string;
let slug: string;
let ownerId: string;
let ownerCookie: string;
let haircutId: string;
let colouringId: string;
let customer: { userId: string; cookie: string };
let since: number;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Salon");
	slug = orgId;
	const owner = await createUserWithSession();
	await joinOrganization(orgId, owner.userId, "owner");
	await activateOrganization(orgId);
	({ userId: ownerId, cookie: ownerCookie } = owner);
	const hours = await staff("PUT", "availability", {
		timezone: TIMEZONE,
		weekly: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
			weekday,
			start: "09:00",
			end: "17:00",
		})),
	});
	expect(hours.status).toBe(200);
	haircutId = (await createService("Haircut", 30, 2500, false)).id;
	colouringId = (await createService("Colouring", 90, 8000, true)).id;
	customer = await createUserWithSession();
	since = Date.now();
});

const staff = (method: string, path: string, body?: unknown) =>
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

const createService = async (
	name: string,
	durationMinutes: number,
	priceMinor: number,
	requiresApproval: boolean,
) =>
	unwrap<ServiceDto>(
		await staff("POST", "services", {
			name,
			durationMinutes,
			priceMinor,
			requiresApproval,
		}),
	);

const storefront = (path = "", init: RequestInit = {}) =>
	fetch(new URL(`/api/public/organizations/${slug}${path}`, base), init);

const times = (serviceId: string, from: string, to = from) =>
	storefront(`/services/${serviceId}/times?from=${from}&to=${to}`).then(
		unwrap<BookableTimesDto>,
	);

const selfBook = (
	body: Record<string, unknown>,
	cookie: string | null = customer.cookie,
) =>
	storefront("/bookings", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(cookie && { cookie }),
		},
		body: JSON.stringify(body),
	});

const today = () => todayIn(TIMEZONE);
const tomorrow = () => addDaysToDate(today(), 1);

/** Wall-clock time on a local date, as an instant; fine away from a DST change. */
const at = (date: string, hours: number, minutes = 0) =>
	new Date(
		startOfLocalDate(date, TIMEZONE).getTime() +
			(hours * 60 + minutes) * 60_000,
	).toISOString();

const sentTo = async (to: string) =>
	(await readOutboxEmails())
		.map(({ email }) => email)
		.filter((email) => email.to === to && Date.parse(email.sentAt) >= since)
		.map((email) => email.subject);

test("an unknown, inactive, scheduled-for-deletion or draft organization has no booking page", async () => {
	const draftId = await insertOrganization("Draft");
	const states = [
		() => {
			slug = "no-such-org";
		},
		() =>
			db
				.update(organization)
				.set({ slotHeldAt: null })
				.where(eq(organization.id, orgId)),
		() =>
			db
				.update(organization)
				.set({ deletionScheduledAt: new Date() })
				.where(eq(organization.id, orgId)),
		() => {
			slug = draftId;
		},
	];
	for (const enter of states) {
		await activateOrganization(orgId);
		await db
			.update(organization)
			.set({ deletionScheduledAt: null })
			.where(eq(organization.id, orgId));
		slug = orgId;
		await enter();

		expect((await storefront()).status).toBe(404);
		expect(
			(
				await storefront(
					`/services/${haircutId}/times?from=${tomorrow()}&to=${tomorrow()}`,
				)
			).status,
		).toBe(404);
		expect(
			(await selfBook({ serviceId: haircutId, startsAt: at(tomorrow(), 10) }))
				.status,
		).toBe(404);
	}
	expect(await db.select().from(booking)).toEqual([]);
});

test("the booking page lists active services with what a customer needs", async () => {
	const hidden = await createService("Hidden", 30, 1000, false);
	await staff("PATCH", `services/${hidden.id}`, { isActive: false });
	const archived = await createService("Archived", 30, 1000, false);
	await staff("DELETE", `services/${archived.id}`);

	const page = await storefront().then(unwrap<StorefrontDto>);
	expect(page.organization).toMatchObject({
		name: "Salon",
		slug,
		timezone: TIMEZONE,
		currency: "EUR",
	});
	expect(page.services).toEqual([
		{
			id: colouringId,
			name: "Colouring",
			description: null,
			durationMinutes: 90,
			priceMinor: 8000,
			currency: "EUR",
			requiresApproval: true,
			cancellationWindowMinutes: 0,
		},
		{
			id: haircutId,
			name: "Haircut",
			description: null,
			durationMinutes: 30,
			priceMinor: 2500,
			currency: "EUR",
			requiresApproval: false,
			cancellationWindowMinutes: 0,
		},
	]);
});

test("bookable times are clamped to today through 60 days ahead", async () => {
	const last = addDaysToDate(today(), BOOKING_LIMITS.selfBookingDays);
	const edge = await times(haircutId, addDaysToDate(last, -1), last);
	expect(edge.timezone).toBe(TIMEZONE);
	expect(edge.times).toContain(at(last, 10));
	expect(edge.times.every((time) => time < at(last, 23))).toBe(true);

	const beyond = await times(
		haircutId,
		addDaysToDate(last, 1),
		addDaysToDate(last, 5),
	);
	expect(beyond.times).toEqual([]);
	const past = await times(
		haircutId,
		addDaysToDate(today(), -5),
		addDaysToDate(today(), -1),
	);
	expect(past.times).toEqual([]);

	const tooLong = await storefront(
		`/services/${haircutId}/times?from=${today()}&to=${addDaysToDate(today(), 40)}`,
	);
	expect(tooLong.status).toBe(400);
	const foreign = await storefront(
		`/services/missing/times?from=${today()}&to=${today()}`,
	);
	expect(foreign.status).toBe(404);
});

test("a start that isn't a free bookable time is refused", async () => {
	const ten = at(tomorrow(), 10);
	const booked = await selfBook({ serviceId: haircutId, startsAt: ten });
	expect(booked.status).toBe(201);

	const other = await createUserWithSession();
	const last = addDaysToDate(today(), BOOKING_LIMITS.selfBookingDays);
	const refused = [
		at(tomorrow(), 10, 5),
		at(tomorrow(), 20),
		ten,
		at(tomorrow(), 9, 45),
		at(addDaysToDate(today(), -1), 10),
		at(addDaysToDate(last, 1), 10),
	];
	for (const startsAt of refused) {
		const res = await selfBook(
			{ serviceId: haircutId, startsAt },
			other.cookie,
		);
		expect(res.status).toBe(409);
		expect(await errorCode(res)).toBe(API_ERROR_CODES.BOOKING_TIME_TAKEN);
	}
	const lastDay = await selfBook(
		{ serviceId: haircutId, startsAt: at(last, 10) },
		other.cookie,
	);
	expect(lastDay.status).toBe(201);

	expect(
		(await selfBook({ serviceId: haircutId, startsAt: "tomorrow" })).status,
	).toBe(400);
	expect(
		(await selfBook({ serviceId: "missing", startsAt: at(tomorrow(), 11) }))
			.status,
	).toBe(404);
	const listed = await times(haircutId, tomorrow());
	expect(listed.times).not.toContain(ten);
	expect(listed.times).not.toContain(at(tomorrow(), 9, 45));
});

test("a customer may hold five upcoming bookings here; a cancelled or past one doesn't count", async () => {
	const ids: string[] = [];
	for (const hour of [9, 10, 11, 12, 13]) {
		const res = await selfBook({
			serviceId: haircutId,
			startsAt: at(tomorrow(), hour),
		});
		ids.push((await unwrap<CustomerBookingDto>(res)).id);
	}
	const sixth = await selfBook({
		serviceId: haircutId,
		startsAt: at(tomorrow(), 14),
	});
	expect(sixth.status).toBe(409);
	expect(await errorCode(sixth)).toBe(API_ERROR_CODES.BOOKING_LIMIT_REACHED);

	const other = await createUserWithSession();
	expect(
		(
			await selfBook(
				{ serviceId: haircutId, startsAt: at(tomorrow(), 14) },
				other.cookie,
			)
		).status,
	).toBe(201);

	await db
		.update(booking)
		.set({ status: "cancelled", cancelledBy: "customer" })
		.where(eq(booking.id, ids[0] ?? ""));
	await db
		.update(booking)
		.set({
			startsAt: new Date(at(addDaysToDate(today(), -2), 10)),
			endsAt: new Date(at(addDaysToDate(today(), -2), 10, 30)),
		})
		.where(eq(booking.id, ids[1] ?? ""));
	for (const hour of [15, 16]) {
		const res = await selfBook({
			serviceId: haircutId,
			startsAt: at(tomorrow(), hour),
		});
		expect(res.status).toBe(201);
	}
	const again = await selfBook({
		serviceId: haircutId,
		startsAt: at(addDaysToDate(tomorrow(), 1), 10),
	});
	expect(await errorCode(again)).toBe(API_ERROR_CODES.BOOKING_LIMIT_REACHED);
});

test("an approval service creates a request and emails the customer and the managers", async () => {
	const admin = await createUserWithSession();
	const staffMember = await createUserWithSession();
	await joinOrganization(orgId, admin.userId, "admin");
	await joinOrganization(orgId, staffMember.userId, "staff");

	const res = await selfBook({
		serviceId: colouringId,
		startsAt: at(tomorrow(), 13),
		customerPhone: "+370 600 00000",
		customerNote: "Blonde, please",
	});
	expect(res.status).toBe(201);
	const created = await unwrap<CustomerBookingDto>(res);
	expect(created).toMatchObject({
		status: "pending",
		serviceName: "Colouring",
		priceMinor: 8000,
		customerNote: "Blonde, please",
		organization: { name: "Salon", slug, timezone: TIMEZONE },
	});
	expect(created).not.toHaveProperty("internalNote");
	expect(created).not.toHaveProperty("customerEmail");

	const [row] = await db
		.select()
		.from(booking)
		.where(eq(booking.id, created.id));
	expect(row).toMatchObject({
		customerUserId: customer.userId,
		customerName: "Test User",
		customerEmail: `${customer.userId}@test.dev`,
		customerPhone: "+370 600 00000",
		internalNote: null,
	});
	const [event] = await db
		.select()
		.from(bookingEvent)
		.where(eq(bookingEvent.bookingId, created.id));
	expect(event).toMatchObject({
		type: "created",
		toStatus: "pending",
		actorType: "customer",
		actorUserId: customer.userId,
	});

	expect(await sentTo(`${customer.userId}@test.dev`)).toEqual([
		"Request received: Colouring at Salon",
	]);
	for (const manager of [ownerId, admin.userId]) {
		const subjects = await sentTo(`${manager}@test.dev`);
		expect(subjects).toHaveLength(1);
		expect(subjects[0]).toStartWith("New booking request: Colouring");
	}
	expect(await sentTo(`${staffMember.userId}@test.dev`)).toEqual([]);
});

test("an auto-confirm service books straight away and sends the confirmation", async () => {
	const res = await selfBook({
		serviceId: haircutId,
		startsAt: at(tomorrow(), 10),
	});
	expect((await unwrap<CustomerBookingDto>(res)).status).toBe("confirmed");

	const subjects = await sentTo(`${customer.userId}@test.dev`);
	expect(subjects).toHaveLength(1);
	expect(subjects[0]).toStartWith("Booking confirmed");
	const owner = await sentTo(`${ownerId}@test.dev`);
	expect(owner).toHaveLength(1);
	expect(owner[0]).toStartWith("New booking: Haircut");
});

test("members may book their own organization", async () => {
	const res = await selfBook(
		{ serviceId: haircutId, startsAt: at(tomorrow(), 10) },
		ownerCookie,
	);
	expect(res.status).toBe(201);
});

test("booking without a session is 401, while browsing needs none", async () => {
	const res = await selfBook(
		{ serviceId: haircutId, startsAt: at(tomorrow(), 10) },
		null,
	);
	expect(res.status).toBe(401);
	expect((await storefront()).status).toBe(200);
	expect(await db.select().from(booking)).toEqual([]);
});
