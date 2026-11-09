import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { type Membership, registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import { addDaysToDate } from "@backend/lib/localDate";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { analyticsDaily } from "@db/schema/analyticsSchema";
import { booking } from "@db/schema/bookingSchema";
import { organization } from "@db/schema/organizationSchema";
import { service } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import { todayIn } from "@servicesModule";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type BookingParty,
	type BookingStatus,
	type BookingsDto,
	type FunnelDto,
	type PlanSlug,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerAnalyticsRoutes } from "../routes";
import { getBookings, getBookingsBreakdown, getFunnel } from "../service";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerAnalyticsRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

// UTC+2 in March, so 22:30 UTC is already the next day there
const TIMEZONE = "Europe/Vilnius";

type Session = { userId: string; cookie: string };

let owner: Session;
let orgId: string;
let haircut: string;
let colour: string;

const insertService = async (name: string) => {
	const id = crypto.randomUUID();
	await db.insert(service).values({
		id,
		organizationId: orgId,
		name,
		slug: name.toLowerCase(),
		durationMinutes: 30,
		priceMinor: 1000,
		currency: "EUR",
	});
	return id;
};

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	owner = await createUserWithSession();
	orgId = await insertOrganization("Salon");
	await joinOrganization(orgId, owner.userId, "owner");
	await activateOrganization(orgId, "professional");
	await db
		.update(organization)
		.set({ timezone: TIMEZONE, currency: "EUR" })
		.where(eq(organization.id, orgId));
	haircut = await insertService("Haircut");
	colour = await insertService("Colour");
});

type BookingSeed = {
	createdAt: string | Date;
	startsAt: string | Date;
	status?: BookingStatus;
	priceMinor?: number;
	bookedBy?: BookingParty;
	cancelledBy?: BookingParty;
	serviceId?: string;
};

const addBooking = async (seed: BookingSeed) => {
	const status = seed.status ?? "confirmed";
	const start = new Date(seed.startsAt);
	await db.insert(booking).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		serviceId: seed.serviceId ?? haircut,
		bookedBy: seed.bookedBy ?? "organization",
		customerName: "Ona",
		customerEmail: "ona@example.com",
		startsAt: start,
		endsAt: new Date(start.getTime() + 30 * 60 * 1000),
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 0,
		priceMinor: seed.priceMinor ?? 1000,
		currency: "EUR",
		status,
		cancelledBy:
			status === "cancelled" ? (seed.cancelledBy ?? "organization") : null,
		createdAt: new Date(seed.createdAt),
	});
};

const membership = (plan: PlanSlug = "professional"): Membership => ({
	organizationId: orgId,
	roles: ["owner"],
	status: "active",
	plan,
});

// 01:30 on 11 March in Vilnius, so the last complete day is 10 March
const NOW = new Date("2026-03-10T23:30:00Z");
const MARCH = { from: "2026-03-01", to: "2026-03-10" };

const unwrap = <T>(
	result: { ok: true; data: T } | { ok: false; error: string },
) => {
	if (!result.ok) throw new Error(result.error);
	return result.data;
};

const bookings = async () =>
	unwrap(await getBookings(membership(), MARCH, NOW));
const breakdown = async () =>
	unwrap(await getBookingsBreakdown(membership(), MARCH, NOW));

const day = (data: BookingsDto, date: string) =>
	data.series.find((row) => row.date === date);

test("bookings made go by the local day of createdAt, booked value by that of startsAt", async () => {
	// made 23:30 on 4 March local, starts 00:15 on 8 March local
	await addBooking({
		createdAt: "2026-03-04T21:30:00Z",
		startsAt: "2026-03-07T22:15:00Z",
		status: "completed",
		priceMinor: 2000,
	});
	// made 00:30 on 5 March local, starts 23:45 on 7 March local
	await addBooking({
		createdAt: "2026-03-04T22:30:00Z",
		startsAt: "2026-03-07T21:45:00Z",
		priceMinor: 1000,
	});
	// made 00:30 on 1 March local, starts today (11 March local)
	await addBooking({
		createdAt: "2026-02-28T22:30:00Z",
		startsAt: "2026-03-10T22:30:00Z",
		priceMinor: 400,
	});
	// made today, starts 23:30 on 28 February local
	await addBooking({
		createdAt: "2026-03-10T22:30:00Z",
		startsAt: "2026-02-28T21:30:00Z",
		priceMinor: 800,
	});

	const data = await bookings();
	expect(data.series).toHaveLength(10);
	expect(data.totals).toEqual({ bookings: 3, bookedMinor: 3000 });
	expect(day(data, "2026-03-01")).toEqual({
		date: "2026-03-01",
		bookings: 1,
		bookedMinor: 0,
	});
	expect(day(data, "2026-03-04")?.bookings).toBe(1);
	expect(day(data, "2026-03-05")?.bookings).toBe(1);
	expect(day(data, "2026-03-07")?.bookedMinor).toBe(1000);
	expect(day(data, "2026-03-08")?.bookedMinor).toBe(2000);
	expect(day(data, "2026-03-10")).toEqual({
		date: "2026-03-10",
		bookings: 0,
		bookedMinor: 0,
	});

	// per service by createdAt; the rates by startsAt
	const { services, cancellation } = await breakdown();
	expect(services).toEqual([
		{ serviceId: haircut, name: "Haircut", bookings: 3, bookedMinor: 3400 },
	]);
	expect(cancellation.bookings).toBe(2);
});

test("cancelled, pending and no-show bookings add no booked value", async () => {
	const startsAt = "2026-03-05T10:00:00Z";
	const createdAt = "2026-03-02T10:00:00Z";
	for (const [status, priceMinor] of [
		["confirmed", 1000],
		["completed", 200],
		["cancelled", 30_000],
		["pending", 40_000],
		["no_show", 50_000],
	] as const)
		await addBooking({ createdAt, startsAt, status, priceMinor });

	const data = await bookings();
	expect(data.totals).toEqual({ bookings: 5, bookedMinor: 1200 });
	expect(day(data, "2026-03-05")?.bookedMinor).toBe(1200);
	expect((await breakdown()).services[0]?.bookedMinor).toBe(1200);
});

test("services are listed most booked first with their value", async () => {
	const createdAt = "2026-03-02T10:00:00Z";
	const startsAt = "2026-03-03T10:00:00Z";
	await addBooking({ createdAt, startsAt, serviceId: haircut });
	await addBooking({ createdAt, startsAt, serviceId: colour, priceMinor: 500 });
	await addBooking({
		createdAt,
		startsAt,
		serviceId: colour,
		status: "cancelled",
	});

	expect((await breakdown()).services).toEqual([
		{ serviceId: colour, name: "Colour", bookings: 2, bookedMinor: 500 },
		{ serviceId: haircut, name: "Haircut", bookings: 1, bookedMinor: 1000 },
	]);
});

test("cancellation is split by who cancelled, out of every booking starting in the range", async () => {
	const createdAt = "2026-02-20T10:00:00Z";
	const startsAt = "2026-03-04T10:00:00Z";
	await addBooking({ createdAt, startsAt, status: "completed" });
	await addBooking({ createdAt, startsAt, status: "pending" });
	await addBooking({
		createdAt,
		startsAt,
		status: "cancelled",
		cancelledBy: "customer",
	});
	await addBooking({
		createdAt,
		startsAt,
		status: "cancelled",
		cancelledBy: "organization",
	});
	// starts today, outside the range
	await addBooking({
		createdAt,
		startsAt: "2026-03-11T08:00:00Z",
		status: "cancelled",
	});

	expect((await breakdown()).cancellation).toEqual({
		bookings: 4,
		cancelledByCustomer: 1,
		cancelledByOrganization: 1,
		rate: 0.5,
		customerRate: 0.25,
		organizationRate: 0.25,
	});
});

test("the no-show rate counts only completed and no-show bookings that started in the range", async () => {
	const createdAt = "2026-02-20T10:00:00Z";
	const startsAt = "2026-03-04T10:00:00Z";
	for (const status of [
		"completed",
		"completed",
		"completed",
		"no_show",
		"pending",
		"confirmed",
		"cancelled",
	] as const)
		await addBooking({ createdAt, startsAt, status });
	await addBooking({
		createdAt,
		startsAt: "2026-03-12T10:00:00Z",
		status: "no_show",
	});

	expect((await breakdown()).noShow).toEqual({
		finished: 4,
		noShows: 1,
		rate: 0.25,
	});
});

test("rates with nothing to divide by are null", async () => {
	expect((await breakdown()).cancellation.rate).toBeNull();

	const createdAt = "2026-02-20T10:00:00Z";
	const startsAt = "2026-03-04T10:00:00Z";
	await addBooking({ createdAt, startsAt, status: "pending" });
	await addBooking({ createdAt, startsAt, status: "confirmed" });

	const { cancellation, noShow } = await breakdown();
	expect(cancellation).toMatchObject({
		rate: 0,
		customerRate: 0,
		organizationRate: 0,
	});
	expect(noShow).toEqual({ finished: 0, noShows: 0, rate: null });
});

test("the funnel sums daily visitors, then counts storefront bookings made in the range", async () => {
	await db.insert(analyticsDaily).values(
		[
			{ localDate: "2026-03-02", metric: "total", events: 30, visitors: 20 },
			{ localDate: "2026-03-03", metric: "total", events: 15, visitors: 10 },
			{ localDate: "2026-03-11", metric: "total", events: 99, visitors: 99 },
			{
				localDate: "2026-03-03",
				metric: "booking_started",
				events: 9,
				visitors: 6,
			},
			{
				localDate: "2026-03-03",
				metric: "device",
				key: "mobile",
				events: 5,
				visitors: 5,
			},
		].map((row) => ({ key: "", ...row, organizationId: orgId })),
	);
	const startsAt = "2026-03-20T10:00:00Z";
	await addBooking({
		createdAt: "2026-03-03T10:00:00Z",
		startsAt,
		bookedBy: "customer",
	});
	await addBooking({
		createdAt: "2026-03-03T11:00:00Z",
		startsAt,
		bookedBy: "customer",
		status: "cancelled",
		cancelledBy: "customer",
	});
	await addBooking({ createdAt: "2026-03-03T12:00:00Z", startsAt });
	await addBooking({
		createdAt: "2026-03-10T22:30:00Z",
		startsAt,
		bookedBy: "customer",
	});

	expect(unwrap(await getFunnel(membership(), MARCH, NOW)).steps).toEqual([
		{ step: "viewed", count: 30 },
		{ step: "started", count: 6 },
		{ step: "booked", count: 2 },
	]);
});

test("a zone name the database doesn't know still groups by local day", async () => {
	await db
		.update(organization)
		.set({ timezone: "Asia/Calcutta" })
		.where(eq(organization.id, orgId));
	// made 00:30 on 5 March in Kolkata, starts 00:15 on 8 March there
	await addBooking({
		createdAt: "2026-03-04T19:00:00Z",
		startsAt: "2026-03-07T18:45:00Z",
		bookedBy: "customer",
	});

	const data = await bookings();
	expect(day(data, "2026-03-05")?.bookings).toBe(1);
	expect(day(data, "2026-03-08")?.bookedMinor).toBe(1000);
	expect((await breakdown()).cancellation.bookings).toBe(1);
	expect(
		unwrap(await getFunnel(membership(), MARCH, NOW)).steps,
	).toContainEqual({ step: "booked", count: 1 });
});

// The endpoints run on the real clock, so their rows are dated relative to it.
const yesterday = () => addDaysToDate(todayIn(TIMEZONE, new Date()), -1);

const get = (path: string, session: Session = owner) =>
	fetch(new URL(`/api/organizations/${orgId}/analytics/${path}`, base), {
		headers: { cookie: session.cookie },
	});

const dataOf = async <T>(response: Response) => {
	const body = (await response.json()) as ApiResponse<T>;
	if (!body.isSuccess) throw new Error(body.message);
	return body.data;
};

const ADVANCED = ["bookings/breakdown", "funnel", "export?report=bookings"];

test("Starter gets booking totals; every advanced endpoint is 402", async () => {
	await activateOrganization(orgId, "starter");
	const totals = await get("bookings");
	expect(totals.status).toBe(200);
	expect((await dataOf<BookingsDto>(totals)).range.retentionDays).toBe(30);

	for (const path of ADVANCED) {
		const response = await get(path);
		expect(response.status).toBe(402);
		expect(await response.json()).toMatchObject({
			code: API_ERROR_CODES.PLAN_UPGRADE_REQUIRED,
		});
	}
});

test("staff can't read booking analytics", async () => {
	const staff = await createUserWithSession();
	await joinOrganization(orgId, staff.userId, "staff");
	for (const path of ["bookings", ...ADVANCED])
		expect((await get(path, staff)).status).toBe(403);
});

test("the funnel endpoint answers for Professional", async () => {
	const response = await get("funnel");
	expect(response.status).toBe(200);
	expect((await dataOf<FunnelDto>(response)).steps).toHaveLength(3);
});

test("the export needs a known report", async () => {
	expect((await get("export")).status).toBe(400);
	expect((await get("export?report=payments")).status).toBe(400);
});

test("the bookings export has a header and one row per day", async () => {
	const to = yesterday();
	const from = addDaysToDate(to, -2);
	await addBooking({
		createdAt: `${to}T10:00:00Z`,
		startsAt: `${to}T10:00:00Z`,
		priceMinor: 2550,
	});

	const response = await get(`export?report=bookings&from=${from}&to=${to}`);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
	expect(response.headers.get("content-disposition")).toBe(
		`attachment; filename="analytics-bookings-${from}-to-${to}.csv"`,
	);
	expect((await response.text()).trimEnd().split("\r\n")).toEqual([
		'"Date","Bookings made","Booked value","Currency"',
		`"${from}","0","0.00","EUR"`,
		`"${addDaysToDate(from, 1)}","0","0.00","EUR"`,
		`"${to}","1","25.50","EUR"`,
	]);
});

test("the traffic and funnel exports", async () => {
	const to = yesterday();
	await db.insert(analyticsDaily).values([
		{
			organizationId: orgId,
			localDate: to,
			metric: "total",
			key: "",
			events: 8,
			visitors: 4,
		},
		{
			organizationId: orgId,
			localDate: to,
			metric: "booking_started",
			key: "",
			events: 1,
			visitors: 1,
		},
	]);
	const range = `from=${to}&to=${to}`;

	const traffic = await get(`export?report=traffic&${range}`);
	expect(traffic.headers.get("content-disposition")).toBe(
		`attachment; filename="analytics-traffic-${to}-to-${to}.csv"`,
	);
	expect(await traffic.text()).toBe(
		`"Date","Views","Visitors"\r\n"${to}","8","4"\r\n`,
	);

	const funnel = await get(`export?report=funnel&${range}`);
	expect((await funnel.text()).trimEnd().split("\r\n")).toEqual([
		'"Step","Count","Of previous step"',
		'"Viewed","4",""',
		'"Started booking","1","25.0%"',
		'"Booked","0","0.0%"',
	]);
});
