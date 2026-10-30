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
import {
	availabilityException,
	serviceAvailability,
} from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type AvailabilityDto,
	type ClosureDto,
} from "@sinwy/shared";
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

const weekdays = [1, 2, 3, 4, 5].map((weekday) => ({
	weekday,
	start: "09:00",
	end: "17:00",
}));

const save = async (
	body: unknown,
	cookie = ownerCookie,
	organizationId = orgId,
) => {
	const res = await call("PUT", "availability", cookie, body, organizationId);
	expect(res.status).toBe(200);
	return unwrap<AvailabilityDto>(res);
};

const rowsOf = (organizationId: string) =>
	db
		.select({ weekday: serviceAvailability.weekday })
		.from(serviceAvailability)
		.where(eq(serviceAvailability.organizationId, organizationId));

const timezoneOf = async (organizationId: string) => {
	const [row] = await db
		.select({ timezone: organization.timezone })
		.from(organization)
		.where(eq(organization.id, organizationId));
	return row?.timezone;
};

const daysFromToday = (days: number) => {
	const date = new Date(`${todayIn("UTC")}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
};

test("PUT replaces the org's hours and timezone, leaving other orgs alone", async () => {
	const other = await seedOrg("Barber");
	await save(
		{ timezone: "Europe/Riga", weekly: weekdays },
		other.ownerCookie,
		other.orgId,
	);

	await save({ timezone: "Europe/Vilnius", weekly: weekdays });
	const saved = await save({
		timezone: "Europe/Vilnius",
		weekly: [
			{ weekday: 6, start: "10:00", end: "14:30" },
			{ weekday: 1, start: "08:45", end: "12:15" },
		],
	});

	expect(saved).toEqual({
		timezone: "Europe/Vilnius",
		weekly: [
			{ weekday: 1, start: "08:45", end: "12:15" },
			{ weekday: 6, start: "10:00", end: "14:30" },
		],
		closures: [],
	});
	expect(await rowsOf(orgId)).toHaveLength(2);
	expect(await timezoneOf(orgId)).toBe("Europe/Vilnius");
	expect(await rowsOf(other.orgId)).toHaveLength(5);
	expect(await timezoneOf(other.orgId)).toBe("Europe/Riga");

	const cleared = await save({ timezone: "Europe/Vilnius", weekly: [] });
	expect(cleared.weekly).toEqual([]);
	expect(await rowsOf(orgId)).toHaveLength(0);
});

test("invalid bodies are rejected with 400 and nothing is written", async () => {
	await save({ timezone: "Europe/Vilnius", weekly: weekdays });

	const invalid = [
		{ timezone: "Mars/Olympus", weekly: [] },
		{ timezone: "+02:00", weekly: [] },
		{ timezone: "UTC", weekly: [{ weekday: 1, start: "17:00", end: "09:00" }] },
		{ timezone: "UTC", weekly: [{ weekday: 1, start: "09:00", end: "09:00" }] },
		{ timezone: "UTC", weekly: [{ weekday: 1, start: "09:10", end: "17:00" }] },
		{ timezone: "UTC", weekly: [{ weekday: 1, start: "9:00", end: "17:00" }] },
		{ timezone: "UTC", weekly: [{ weekday: 8, start: "09:00", end: "17:00" }] },
		{
			timezone: "UTC",
			weekly: [
				{ weekday: 2, start: "09:00", end: "12:00" },
				{ weekday: 2, start: "13:00", end: "17:00" },
			],
		},
	];
	for (const body of invalid) {
		const res = await call("PUT", "availability", ownerCookie, body);
		expect(res.status).toBe(400);
	}

	expect(await rowsOf(orgId)).toHaveLength(5);
	expect(await timezoneOf(orgId)).toBe("Europe/Vilnius");
});

test("closures: same date twice is one row, GET lists today onwards, DELETE removes", async () => {
	const date = daysFromToday(7);
	const first = await unwrap<ClosureDto>(
		await call("POST", "availability/closures", ownerCookie, {
			date,
			note: " Holiday ",
		}),
	);
	expect(first).toMatchObject({ date, note: "Holiday" });

	const again = await call("POST", "availability/closures", ownerCookie, {
		date,
	});
	expect(again.status).toBe(201);
	expect(await unwrap<ClosureDto>(again)).toEqual(first);

	await db.insert(availabilityException).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		date: daysFromToday(-2),
		kind: "closed",
	});

	const { closures } = await unwrap<AvailabilityDto>(
		await call("GET", "availability", staffCookie),
	);
	expect(closures).toEqual([first]);

	const other = await seedOrg("Barber");
	expect(
		(
			await call(
				"DELETE",
				`availability/closures/${first.id}`,
				other.ownerCookie,
				undefined,
				other.orgId,
			)
		).status,
	).toBe(404);

	expect(
		(await call("DELETE", `availability/closures/${first.id}`, ownerCookie))
			.status,
	).toBe(200);
	expect(
		(await call("DELETE", `availability/closures/${first.id}`, ownerCookie))
			.status,
	).toBe(404);
});

test("closure dates must be real calendar dates", async () => {
	for (const date of ["2026-02-30", "2026-13-01", "next monday", ""]) {
		const res = await call("POST", "availability/closures", ownerCookie, {
			date,
		});
		expect(res.status).toBe(400);
	}
});

test("staff can read availability but not write it", async () => {
	const writes = [
		call("PUT", "availability", staffCookie, {
			timezone: "UTC",
			weekly: weekdays,
		}),
		call("POST", "availability/closures", staffCookie, {
			date: daysFromToday(1),
		}),
		call("DELETE", "availability/closures/anything", staffCookie),
	];
	for (const res of await Promise.all(writes)) expect(res.status).toBe(403);

	expect((await call("GET", "availability", staffCookie)).status).toBe(200);
	expect(await rowsOf(orgId)).toHaveLength(0);
});

test("inactive organization: writes 409 ORGANIZATION_INACTIVE, reads 200", async () => {
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));

	const writes = [
		call("PUT", "availability", ownerCookie, {
			timezone: "UTC",
			weekly: weekdays,
		}),
		call("POST", "availability/closures", ownerCookie, {
			date: daysFromToday(1),
		}),
		call("DELETE", "availability/closures/anything", ownerCookie),
	];
	for (const res of await Promise.all(writes)) {
		expect(res.status).toBe(409);
		expect(((await res.json()) as ApiResponse<never>).code).toBe(
			API_ERROR_CODES.ORGANIZATION_INACTIVE,
		);
	}

	expect((await call("GET", "availability", ownerCookie)).status).toBe(200);
	expect(await rowsOf(orgId)).toHaveLength(0);
});

test("check constraints reject out-of-range rows written directly", async () => {
	const insert = (values: Partial<typeof serviceAvailability.$inferInsert>) =>
		db
			.insert(serviceAvailability)
			.values({
				id: crypto.randomUUID(),
				organizationId: orgId,
				weekday: 1,
				startTime: "09:00",
				endTime: "17:00",
				...values,
			})
			.then(
				() => null,
				(error) => error,
			);

	expect(await insert({ weekday: 0 })).toBeTruthy();
	expect(await insert({ startTime: "17:00", endTime: "09:00" })).toBeTruthy();
	expect(await insert({})).toBeNull();
});
