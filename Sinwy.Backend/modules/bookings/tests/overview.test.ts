import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { type Membership, registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { booking } from "@db/schema/bookingSchema";
import { organization } from "@db/schema/organizationSchema";
import {
	availabilityException,
	service,
	serviceAvailability,
} from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import type {
	ApiResponse,
	BookingOverviewDto,
	BookingStatus,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerBookingRoutes } from "../routes";
import { getOverview } from "../service";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerBookingRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

let orgId: string;
let ownerCookie: string;
let serviceId: string;
let membership: Membership;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Salon");
	const owner = await createUserWithSession();
	ownerCookie = owner.cookie;
	await joinOrganization(orgId, owner.userId, "owner");
	await activateOrganization(orgId);
	await db
		.update(organization)
		.set({ timezone: "Europe/Vilnius" })
		.where(eq(organization.id, orgId));
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
	membership = {
		organizationId: orgId,
		roles: ["owner"],
		status: "active",
		plan: null,
	};
});

const addBooking = async (
	startsAt: string,
	status: BookingStatus,
	priceMinor: number,
	minutes = 30,
) => {
	const start = new Date(startsAt);
	await db.insert(booking).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		serviceId,
		customerName: "Ona",
		customerEmail: "ona@example.com",
		startsAt: start,
		endsAt: new Date(start.getTime() + minutes * 60 * 1000),
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 0,
		priceMinor,
		currency: "EUR",
		status,
		cancelledBy: status === "cancelled" ? "organization" : null,
	});
};

const openEveryDay = () =>
	db.insert(serviceAvailability).values(
		[1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
			id: crypto.randomUUID(),
			organizationId: orgId,
			weekday,
			startTime: "09:00",
			endTime: "17:00",
		})),
	);

const overview = async (now: string) => {
	const result = await getOverview(membership, new Date(now));
	if (!result.ok) throw new Error(result.error);
	return result.data;
};

// Wednesday 4 November 2026, 12:00 in Vilnius (UTC+2); its ISO week runs 2–8 November.
const NOW = "2026-11-04T10:00:00Z";

test("booked value counts this week's confirmed and completed bookings, by the organization's week", async () => {
	await addBooking("2026-11-02T08:00:00Z", "confirmed", 2500);
	await addBooking("2026-11-03T08:00:00Z", "completed", 1000);
	await addBooking("2026-11-03T10:00:00Z", "pending", 8000);
	await addBooking("2026-11-03T12:00:00Z", "cancelled", 8000);
	await addBooking("2026-11-03T14:00:00Z", "no_show", 8000);
	// Monday 00:30 and Sunday 23:30 local fall on UTC Sunday evenings
	await addBooking("2026-11-01T22:30:00Z", "confirmed", 700);
	await addBooking("2026-11-08T21:30:00Z", "confirmed", 500);
	await addBooking("2026-11-01T21:30:00Z", "confirmed", 9000);
	await addBooking("2026-11-08T22:30:00Z", "completed", 9000);

	const data = await overview(NOW);

	expect(data.week).toEqual({ from: "2026-11-02", to: "2026-11-08" });
	expect(data.revenue).toEqual({ bookedMinor: 4700, completedMinor: 1000 });
	expect(data.currency).toBe("EUR");
});

test("the week follows the organization's zone across a DST change", async () => {
	// 19–25 October 2026: Vilnius is UTC+3 until the clocks go back on Sunday the 25th
	await addBooking("2026-10-18T21:30:00Z", "confirmed", 100);
	await addBooking("2026-10-25T21:30:00Z", "confirmed", 200);
	await addBooking("2026-10-18T20:30:00Z", "confirmed", 9000);
	await addBooking("2026-10-25T22:30:00Z", "confirmed", 9000);

	const data = await overview("2026-10-21T10:00:00Z");

	expect(data.week).toEqual({ from: "2026-10-19", to: "2026-10-25" });
	expect(data.revenue.bookedMinor).toBe(300);
});

test("occupancy is booked minutes of uncancelled bookings over open minutes, minus closures", async () => {
	await openEveryDay();
	await addBooking("2026-11-02T08:00:00Z", "no_show", 8000, 90);
	await addBooking("2026-11-03T08:00:00Z", "cancelled", 2500, 30);

	expect((await overview(NOW)).occupancy).toEqual({
		bookedMinutes: 90,
		openMinutes: 3360,
		percent: 3,
	});

	await db.insert(availabilityException).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		date: "2026-11-05",
		kind: "closed",
	});
	expect((await overview(NOW)).occupancy.openMinutes).toBe(2880);
});

test("occupancy is null without business hours", async () => {
	await addBooking("2026-11-02T08:00:00Z", "confirmed", 2500);

	expect((await overview(NOW)).occupancy).toEqual({
		bookedMinutes: 30,
		openMinutes: 0,
		percent: null,
	});
});

test("needs attention counts started confirmed bookings and expired requests only", async () => {
	await addBooking("2026-11-03T08:00:00Z", "confirmed", 2500);
	await addBooking("2026-11-04T09:00:00Z", "confirmed", 2500);
	await addBooking("2026-11-03T10:00:00Z", "pending", 2500);
	await addBooking("2026-11-03T12:00:00Z", "completed", 2500);
	await addBooking("2026-11-03T13:00:00Z", "no_show", 2500);
	await addBooking("2026-11-03T14:00:00Z", "cancelled", 2500);
	await addBooking("2026-11-05T08:00:00Z", "confirmed", 2500);
	await addBooking("2026-11-05T09:00:00Z", "pending", 2500);

	const data = await overview(NOW);

	expect(data.needsAttention).toEqual({ unresolved: 2, expiredRequests: 1 });
	expect(data.pending.total).toBe(1);
	expect(data.pending.oldest.map((row) => row.startsAt)).toEqual([
		"2026-11-05T09:00:00.000Z",
	]);
});

test("today's bookings are the local day's, in time order, without cancelled", async () => {
	await addBooking("2026-11-04T12:00:00Z", "confirmed", 2500);
	await addBooking("2026-11-04T07:00:00Z", "completed", 2500);
	await addBooking("2026-11-04T09:00:00Z", "cancelled", 2500);
	// 23:30 local on the 4th, and 00:30 local on the 4th
	await addBooking("2026-11-04T21:30:00Z", "pending", 2500);
	await addBooking("2026-11-03T22:30:00Z", "no_show", 2500);
	await addBooking("2026-11-04T22:30:00Z", "confirmed", 2500);

	const data = await overview(NOW);

	expect(data.today).toBe("2026-11-04");
	expect(data.todayBookings.map((row) => [row.startsAt, row.status])).toEqual([
		["2026-11-03T22:30:00.000Z", "no_show"],
		["2026-11-04T07:00:00.000Z", "completed"],
		["2026-11-04T12:00:00.000Z", "confirmed"],
		["2026-11-04T21:30:00.000Z", "pending"],
	]);
});

test("the overview route serves members and isn't read as a booking id", async () => {
	const path = `/api/organizations/${orgId}/bookings/overview`;
	const res = await fetch(new URL(path, base), {
		headers: { cookie: ownerCookie },
	});
	expect(res.status).toBe(200);
	const body = (await res.json()) as ApiResponse<BookingOverviewDto>;
	expect(body.isSuccess && body.data.timezone).toBe("Europe/Vilnius");

	const stranger = await createUserWithSession();
	const refused = await fetch(new URL(path, base), {
		headers: { cookie: stranger.cookie },
	});
	expect(refused.status).toBe(404);
});
