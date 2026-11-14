import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
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
import { registerServiceRoutes } from "@servicesModule";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type BookingDetailDto,
	type BookingDto,
	type BookingListDto,
	type ServiceDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerBookingRoutes } from "../routes";

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

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	({ orgId, ownerCookie, ownerId } = await seedOrg("Salon"));
});

const seedOrg = async (name: string) => {
	const orgId = await insertOrganization(name);
	const owner = await createUserWithSession();
	await joinOrganization(orgId, owner.userId, "owner");
	await activateOrganization(orgId);
	return { orgId, ownerCookie: owner.cookie, ownerId: owner.userId };
};

const call = (
	method: string,
	path: string,
	cookie: string,
	body?: unknown,
	organizationId = orgId,
) =>
	fetch(new URL(`/api/organizations/${organizationId}/${path}`, base), {
		method,
		headers: { "content-type": "application/json", cookie },
		body: body === undefined ? undefined : JSON.stringify(body),
	});

const unwrap = async <T>(res: Response) => {
	const body = (await res.json()) as ApiResponse<T>;
	if (!body.isSuccess) throw new Error(`request failed: ${body.message}`);
	return body.data;
};

const createService = async (
	values: {
		name?: string;
		durationMinutes?: number;
		bufferBeforeMinutes?: number;
		bufferAfterMinutes?: number;
	} = {},
	organizationId = orgId,
	cookie = ownerCookie,
) =>
	unwrap<ServiceDto>(
		await call(
			"POST",
			"services",
			cookie,
			{ name: "Haircut", durationMinutes: 30, priceMinor: 2500, ...values },
			organizationId,
		),
	);

const book = (
	serviceId: string,
	startsAt: string,
	contact: Record<string, string> = {
		customerName: "Ana",
		customerPhone: "+370 600 00000",
	},
	organizationId = orgId,
	cookie = ownerCookie,
) =>
	call(
		"POST",
		"bookings",
		cookie,
		{ serviceId, startsAt, ...contact },
		organizationId,
	);

const setStatus = (bookingId: string, status: "cancelled" | "no_show") =>
	db
		.update(booking)
		.set({
			status,
			cancelledBy: status === "cancelled" ? "organization" : null,
		})
		.where(eq(booking.id, bookingId));

const errorCode = async (res: Response) =>
	((await res.json()) as ApiResponse<never>).code;

test("a manual booking copies the service, starts confirmed and records who created it", async () => {
	const service = await createService({ bufferAfterMinutes: 10 });
	const res = await book(service.id, "2099-03-01T10:00:00+02:00", {
		customerName: " Ana ",
		customerEmail: "ana@example.com",
		internalNote: "Prefers the window seat",
	});
	expect(res.status).toBe(201);
	const created = await unwrap<BookingDto>(res);
	expect(created).toMatchObject({
		serviceName: "Haircut",
		customerUserId: null,
		customerName: "Ana",
		customerEmail: "ana@example.com",
		customerPhone: null,
		startsAt: "2099-03-01T08:00:00.000Z",
		endsAt: "2099-03-01T08:30:00.000Z",
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 10,
		priceMinor: 2500,
		currency: service.currency,
		status: "confirmed",
		internalNote: "Prefers the window seat",
	});

	const detail = await unwrap<BookingDetailDto>(
		await call("GET", `bookings/${created.id}`, ownerCookie),
	);
	expect(detail.history).toEqual([
		expect.objectContaining({
			type: "created",
			fromStatus: null,
			toStatus: "confirmed",
			actorType: "member",
			actorName: "Test User",
		}),
	]);
	const [event] = await db
		.select({ actorUserId: bookingEvent.actorUserId })
		.from(bookingEvent)
		.where(eq(bookingEvent.bookingId, created.id));
	expect(event?.actorUserId).toBe(ownerId);
});

test("a booking keeps the cancellation window it was made with", async () => {
	const service = await createService();
	const setWindow = (cancellationWindowMinutes: number) =>
		call("PATCH", `services/${service.id}`, ownerCookie, {
			cancellationWindowMinutes,
		});
	expect((await setWindow(1440)).status).toBe(200);
	const created = await unwrap<BookingDto>(
		await book(service.id, "2099-03-01T10:00:00+02:00"),
	);
	expect(created.cancellationWindowMinutes).toBe(1440);

	expect((await setWindow(120)).status).toBe(200);
	const detail = await unwrap<BookingDetailDto>(
		await call("GET", `bookings/${created.id}`, ownerCookie),
	);
	expect(detail.cancellationWindowMinutes).toBe(1440);
});

test("two bookings racing for the same window: one is created, the other is refused", async () => {
	const service = await createService();
	const [first, second] = await Promise.all([
		book(service.id, "2099-03-01T10:00:00Z"),
		book(service.id, "2099-03-01T10:00:00Z"),
	]);
	const statuses = [first.status, second.status].sort();
	expect(statuses).toEqual([201, 409]);

	const refused = first.status === 409 ? first : second;
	expect(await errorCode(refused)).toBe(API_ERROR_CODES.BOOKING_TIME_TAKEN);
	expect(await db.$count(booking)).toBe(1);
	expect(await db.$count(bookingEvent)).toBe(1);
});

test("buffers on either side make bookings clash", async () => {
	const after = await createService({ bufferAfterMinutes: 15 });
	const plain = await createService();
	const before = await createService({ bufferBeforeMinutes: 15 });

	expect((await book(after.id, "2099-03-01T10:00:00Z")).status).toBe(201);
	// inside the existing booking's after-buffer, 10:30–10:45
	expect((await book(plain.id, "2099-03-01T10:30:00Z")).status).toBe(409);
	expect((await book(plain.id, "2099-03-01T10:45:00Z")).status).toBe(201);

	// the new booking's before-buffer reaches back into 11:15
	expect((await book(before.id, "2099-03-01T11:25:00Z")).status).toBe(409);
	expect((await book(before.id, "2099-03-01T11:30:00Z")).status).toBe(201);
});

test("back-to-back bookings without buffers don't clash", async () => {
	const service = await createService();
	for (const start of ["10:00", "10:30", "09:30"])
		expect((await book(service.id, `2099-03-01T${start}:00Z`)).status).toBe(
			201,
		);
});

test("cancelled and no-show bookings, and other organizations' bookings, don't block", async () => {
	const service = await createService();
	const startsAt = "2099-03-01T10:00:00Z";
	for (const status of ["cancelled", "no_show"] as const) {
		const created = await unwrap<BookingDto>(await book(service.id, startsAt));
		await setStatus(created.id, status);
	}

	const other = await seedOrg("Barber");
	const foreign = await createService({}, other.orgId, other.ownerCookie);
	expect(
		(
			await book(
				foreign.id,
				startsAt,
				undefined,
				other.orgId,
				other.ownerCookie,
			)
		).status,
	).toBe(201);
	expect((await book(service.id, startsAt)).status).toBe(201);
});

test("manual bookings need an email or a phone, a valid start and a bookable service", async () => {
	const service = await createService();
	const startsAt = "2099-03-01T10:00:00Z";
	for (const contact of [
		{ customerName: "Ana" },
		{ customerName: "Ana", customerEmail: "", customerPhone: "" },
		{ customerName: " ", customerPhone: "+370 600 00000" },
	])
		expect((await book(service.id, startsAt, contact)).status).toBe(400);
	expect(
		(
			await book(service.id, "tomorrow at ten", {
				customerName: "Ana",
				customerPhone: "+370 600 00000",
			})
		).status,
	).toBe(400);

	const off = await createService();
	await call("PATCH", `services/${off.id}`, ownerCookie, { isActive: false });
	expect((await book(off.id, startsAt)).status).toBe(409);

	const archived = await createService();
	await call("DELETE", `services/${archived.id}`, ownerCookie);
	const other = await seedOrg("Barber");
	const foreign = await createService({}, other.orgId, other.ownerCookie);
	for (const serviceId of [archived.id, foreign.id, "missing"])
		expect((await book(serviceId, startsAt)).status).toBe(404);
});

test("an inactive organization can't take manual bookings but can still read them", async () => {
	const service = await createService();
	const created = await unwrap<BookingDto>(
		await book(service.id, "2099-03-01T10:00:00Z"),
	);
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));

	const refused = await book(service.id, "2099-03-02T10:00:00Z");
	expect(refused.status).toBe(409);
	expect(await errorCode(refused)).toBe(API_ERROR_CODES.ORGANIZATION_INACTIVE);
	expect(
		(await call("GET", `bookings/${created.id}`, ownerCookie)).status,
	).toBe(200);
	expect(
		(await call("GET", "bookings?from=2099-03-01&to=2099-03-01", ownerCookie))
			.status,
	).toBe(200);
});

test("non-members can't book, list or read an organization's bookings", async () => {
	const service = await createService();
	const created = await unwrap<BookingDto>(
		await book(service.id, "2099-03-01T10:00:00Z"),
	);
	const outsider = await createUserWithSession();
	const other = await seedOrg("Barber");

	expect(
		(
			await book(
				service.id,
				"2099-03-02T10:00:00Z",
				undefined,
				orgId,
				outsider.cookie,
			)
		).status,
	).toBe(404);
	expect((await call("GET", "bookings", outsider.cookie)).status).toBe(404);
	expect(
		(await call("GET", `bookings/${created.id}`, outsider.cookie)).status,
	).toBe(404);
	// a member of another organization asking for this booking through their own
	expect(
		(
			await call(
				"GET",
				`bookings/${created.id}`,
				other.ownerCookie,
				undefined,
				other.orgId,
			)
		).status,
	).toBe(404);
});

const list = async (query: string) =>
	unwrap<BookingListDto>(await call("GET", `bookings?${query}`, ownerCookie));

const names = (dto: BookingListDto | BookingDto[]) =>
	("items" in dto ? dto.items : dto).map((item) => item.customerName);

/** Europe/Vilnius is UTC+2 in January. */
const seedVilniusBookings = async () => {
	await db
		.update(organization)
		.set({ timezone: "Europe/Vilnius" })
		.where(eq(organization.id, orgId));
	const haircut = await createService();
	const colour = await createService({
		name: "Colouring",
		durationMinutes: 90,
	});
	const create = async (
		serviceId: string,
		startsAt: string,
		contact: Record<string, string>,
	) => unwrap<BookingDto>(await book(serviceId, startsAt, contact));

	const late = await create(haircut.id, "2099-01-15T21:30:00Z", {
		customerName: "Ana",
		customerEmail: "ana@example.com",
	});
	const early = await create(colour.id, "2099-01-15T22:30:00Z", {
		customerName: "Bob",
		customerPhone: "+370 611 11111",
	});
	const cancelled = await create(haircut.id, "2099-01-14T10:00:00Z", {
		customerName: "Cara_100%",
		customerPhone: "+370 622 22222",
	});
	await setStatus(cancelled.id, "cancelled");
	const past = await create(haircut.id, "2020-01-01T10:00:00Z", {
		customerName: "Dan",
		customerPhone: "+370 633 33333",
	});
	return { haircut, colour, late, early, cancelled, past };
};

test("date filters read local dates in the organization's timezone", async () => {
	await seedVilniusBookings();
	// 21:30Z is 23:30 local on the 15th; 22:30Z is already the 16th
	expect(names(await list("from=2099-01-15&to=2099-01-15"))).toEqual(["Ana"]);
	expect(names(await list("from=2099-01-16&to=2099-01-16"))).toEqual(["Bob"]);
	expect(names(await list("to=2099-01-15"))).toEqual(["Dan", "Ana"]);
	expect(
		(await call("GET", "bookings?from=2099-01-16&to=2099-01-15", ownerCookie))
			.status,
	).toBe(400);
});

test("the default list is today onwards without cancelled, soonest first", async () => {
	await seedVilniusBookings();
	expect(await list("")).toEqual({
		items: [
			expect.objectContaining({ customerName: "Ana", serviceName: "Haircut" }),
			expect.objectContaining({
				customerName: "Bob",
				serviceName: "Colouring",
			}),
		],
		total: 2,
	});
});

test("status, service and search filters combine; search escapes wildcards", async () => {
	const { colour } = await seedVilniusBookings();
	const all = "from=2000-01-01&to=2099-12-31";
	const everyStatus = [
		"pending",
		"confirmed",
		"cancelled",
		"completed",
		"no_show",
	]
		.map((status) => `status=${status}`)
		.join("&");

	expect(names(await list(`${all}&status=cancelled`))).toEqual(["Cara_100%"]);
	expect(
		names(
			await list(`${all}&status=cancelled&status=confirmed&sort=-startsAt`),
		),
	).toEqual(["Bob", "Ana", "Cara_100%", "Dan"]);
	expect(names(await list(`${all}&serviceId=${colour.id}`))).toEqual(["Bob"]);
	expect(names(await list(`${all}&q=ANA%40EXAMPLE`))).toEqual(["Ana"]);
	expect(names(await list(`${all}&q=611`))).toEqual(["Bob"]);
	expect(names(await list(`${all}&${everyStatus}&q=_`))).toEqual(["Cara_100%"]);
	expect(names(await list(`${all}&${everyStatus}&q=%25`))).toEqual([
		"Cara_100%",
	]);
	expect((await call("GET", `bookings?status=lost`, ownerCookie)).status).toBe(
		400,
	);
});

test("pages share one total, and sorting by created puts the newest first", async () => {
	await seedVilniusBookings();
	const all = "from=2000-01-01&to=2099-12-31";

	const second = await list(`${all}&pageSize=2&page=2`);
	expect(second).toEqual({
		items: [expect.objectContaining({ customerName: "Bob" })],
		total: 3,
	});
	expect(names(await list(`${all}&pageSize=2&page=3`))).toEqual([]);
	expect(names(await list(`${all}&sort=-createdAt`))).toEqual([
		"Dan",
		"Bob",
		"Ana",
	]);
	for (const query of ["pageSize=101", "pageSize=0", "page=0", "sort=name"])
		expect((await call("GET", `bookings?${query}`, ownerCookie)).status).toBe(
			400,
		);
});

test("the calendar returns every match in its range, at most 42 days", async () => {
	await seedVilniusBookings();
	const calendar = (query: string) =>
		call("GET", `bookings/calendar?${query}`, ownerCookie);

	const days = await unwrap<BookingDto[]>(
		await calendar("from=2099-01-12&to=2099-01-18"),
	);
	expect(names(days)).toEqual(["Ana", "Bob"]);
	expect(
		names(
			await unwrap<BookingDto[]>(
				await calendar(
					"from=2099-01-12&to=2099-01-18&status=confirmed&status=cancelled",
				),
			),
		),
	).toEqual(["Cara_100%", "Ana", "Bob"]);

	expect((await calendar("from=2099-01-01&to=2099-02-11")).status).toBe(200);
	for (const query of ["from=2099-01-01&to=2099-02-12", "from=2099-01-01", ""])
		expect((await calendar(query)).status).toBe(400);
});
