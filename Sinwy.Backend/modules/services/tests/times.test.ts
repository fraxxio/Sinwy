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
import { organization } from "@db/schema/organizationSchema";
import { serviceAvailability } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import type { ApiResponse, BookableTimesDto, ServiceDto } from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerServiceRoutes } from "../routes";
import { todayIn } from "../utils";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerServiceRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

let orgId: string;
let ownerCookie: string;
let staffCookie: string;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	({ orgId, ownerCookie, staffCookie } = await seedOrg("Salon"));
	await openEveryDay(ownerCookie, orgId);
});

const seedOrg = async (name: string) => {
	const orgId = await insertOrganization(name);
	const owner = await createUserWithSession();
	const staff = await createUserWithSession();
	await joinOrganization(orgId, owner.userId, "owner");
	await joinOrganization(orgId, staff.userId, "staff");
	await activateOrganization(orgId);
	return { orgId, ownerCookie: owner.cookie, staffCookie: staff.cookie };
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

const openEveryDay = async (cookie: string, organizationId: string) => {
	const res = await call(
		"PUT",
		"availability",
		cookie,
		{
			timezone: "UTC",
			weekly: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
				weekday,
				start: "09:00",
				end: "10:00",
			})),
		},
		organizationId,
	);
	expect(res.status).toBe(200);
};

const createService = async (organizationId = orgId, cookie = ownerCookie) =>
	unwrap<ServiceDto>(
		await call(
			"POST",
			"services",
			cookie,
			{ name: "Haircut", durationMinutes: 30, priceMinor: 2500 },
			organizationId,
		),
	);

const day = (offset: number) => {
	const date = new Date(`${todayIn("UTC")}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + offset);
	return {
		iso: date.toISOString().slice(0, 10),
		weekday: date.getUTCDay() || 7,
	};
};

const timesPath = (serviceId: string, from: string, to: string) =>
	`services/${serviceId}/times?from=${from}&to=${to}`;

const getTimes = async (
	serviceId: string,
	from: string,
	to: string,
	cookie = ownerCookie,
) => {
	const res = await call("GET", timesPath(serviceId, from, to), cookie);
	expect(res.status).toBe(200);
	return unwrap<BookableTimesDto>(res);
};

const at = (date: string, clocks: string[]) =>
	clocks.map((clock) => `${date}T${clock}:00.000Z`);

test("times follow the org's hours, skip closed dates, and staff can read them", async () => {
	const { id } = await createService();
	const closed = day(3).iso;
	const closure = await call("POST", "availability/closures", ownerCookie, {
		date: closed,
	});
	expect(closure.status).toBe(201);

	const expected = [1, 2].flatMap((offset) =>
		at(day(offset).iso, ["09:00", "09:15", "09:30"]),
	);
	expect(await getTimes(id, day(1).iso, closed)).toEqual({
		timezone: "UTC",
		times: expected,
	});
	expect((await getTimes(id, day(1).iso, closed, staffCookie)).times).toEqual(
		expected,
	);
});

test("a service's own hours replace the org's; other services keep the org's", async () => {
	const own = await createService();
	const other = await createService();
	const tomorrow = day(1);
	await db.insert(serviceAvailability).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		serviceId: own.id,
		weekday: tomorrow.weekday,
		startTime: "14:00",
		endTime: "15:00",
	});

	expect((await getTimes(own.id, tomorrow.iso, day(2).iso)).times).toEqual(
		at(tomorrow.iso, ["14:00", "14:15", "14:30"]),
	);
	expect((await getTimes(other.id, tomorrow.iso, tomorrow.iso)).times).toEqual(
		at(tomorrow.iso, ["09:00", "09:15", "09:30"]),
	);
});

test("an inactive service has no times; archived, unknown and other orgs' services are 404", async () => {
	const tomorrow = day(1).iso;
	const inactive = await createService();
	const off = await call("PATCH", `services/${inactive.id}`, ownerCookie, {
		isActive: false,
	});
	expect(off.status).toBe(200);
	expect(await getTimes(inactive.id, tomorrow, tomorrow)).toEqual({
		timezone: "UTC",
		times: [],
	});

	const archived = await createService();
	await call("DELETE", `services/${archived.id}`, ownerCookie);
	const other = await seedOrg("Barber");
	await openEveryDay(other.ownerCookie, other.orgId);
	const foreign = await createService(other.orgId, other.ownerCookie);

	for (const serviceId of [archived.id, "missing", foreign.id]) {
		const res = await call(
			"GET",
			timesPath(serviceId, tomorrow, tomorrow),
			ownerCookie,
		);
		expect(res.status).toBe(404);
	}
});

test("ranges must be real dates in order, at most 31 days", async () => {
	const { id } = await createService();
	const from = day(1).iso;
	const bad = [
		`services/${id}/times`,
		`services/${id}/times?from=${from}`,
		timesPath(id, day(2).iso, from),
		timesPath(id, from, day(32).iso),
		timesPath(id, "2027-02-29", "2027-03-01"),
	];
	for (const path of bad)
		expect((await call("GET", path, ownerCookie)).status).toBe(400);

	expect((await getTimes(id, from, day(31).iso)).times).toHaveLength(31 * 3);
});

test("an inactive organization can still read times", async () => {
	const { id } = await createService();
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));

	expect((await getTimes(id, day(1).iso, day(1).iso)).times).toHaveLength(3);
});
