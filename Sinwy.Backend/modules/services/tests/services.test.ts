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
import { service } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import {
	API_ERROR_CODES,
	type ApiResponse,
	type ServiceDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerServiceRoutes } from "../routes";

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

const haircut = { name: "Haircut", durationMinutes: 30, priceMinor: 2500 };

const create = async (
	body: Record<string, unknown> = haircut,
	cookie = ownerCookie,
	organizationId = orgId,
) => {
	const res = await call("POST", "services", cookie, body, organizationId);
	expect(res.status).toBe(201);
	return unwrap<ServiceDto>(res);
};

test("create copies the organization's currency and ignores currency and capacity in the body", async () => {
	await db
		.update(organization)
		.set({ currency: "USD" })
		.where(eq(organization.id, orgId));

	const created = await create({ ...haircut, currency: "JPY", capacity: 9 });
	expect(created).toMatchObject({
		name: "Haircut",
		slug: "haircut",
		description: null,
		durationMinutes: 30,
		priceMinor: 2500,
		currency: "USD",
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 0,
		isActive: true,
	});
	expect(created).not.toHaveProperty("capacity");
	const [row] = await db
		.select({ capacity: service.capacity })
		.from(service)
		.where(eq(service.id, created.id));
	expect(row?.capacity).toBe(1);
});

test("list returns non-archived services by name", async () => {
	await create({ ...haircut, name: "Massage" });
	const beard = await create({ ...haircut, name: "Beard trim" });
	await create();
	await call("DELETE", `services/${beard.id}`, ownerCookie);

	const list = await unwrap<ServiceDto[]>(
		await call("GET", "services", ownerCookie),
	);
	expect(list.map((s) => s.name)).toEqual(["Haircut", "Massage"]);
});

test("PATCH is partial and keeps the slug on rename", async () => {
	const created = await create({
		...haircut,
		description: "Wash and cut",
		bufferAfterMinutes: 10,
	});
	const res = await call("PATCH", `services/${created.id}`, ownerCookie, {
		name: "Men's haircut",
		isActive: false,
	});
	expect(res.status).toBe(200);
	expect(await unwrap<ServiceDto>(res)).toMatchObject({
		name: "Men's haircut",
		slug: "haircut",
		description: "Wash and cut",
		bufferAfterMinutes: 10,
		priceMinor: 2500,
		isActive: false,
	});

	const cleared = await call("PATCH", `services/${created.id}`, ownerCookie, {
		description: "  ",
	});
	expect((await unwrap<ServiceDto>(cleared)).description).toBeNull();
});

test("staff read but never write", async () => {
	const created = await create();
	const writes = [
		call("POST", "services", staffCookie, haircut),
		call("PATCH", `services/${created.id}`, staffCookie, { isActive: false }),
		call("POST", `services/${created.id}/duplicate`, staffCookie),
		call("DELETE", `services/${created.id}`, staffCookie),
	];
	for (const res of await Promise.all(writes)) expect(res.status).toBe(403);

	expect((await call("GET", "services", staffCookie)).status).toBe(200);
	expect(
		(await call("GET", `services/${created.id}`, staffCookie)).status,
	).toBe(200);
	const [row] = await db
		.select({ isActive: service.isActive, archivedAt: service.archivedAt })
		.from(service)
		.where(eq(service.id, created.id));
	expect(row).toEqual({ isActive: true, archivedAt: null });
});

test("another organization's service is 404 on every route", async () => {
	const other = await seedOrg("Other");
	const foreign = await create(haircut, other.ownerCookie, other.orgId);

	const attempts = [
		call("GET", `services/${foreign.id}`, ownerCookie),
		call("PATCH", `services/${foreign.id}`, ownerCookie, { isActive: false }),
		call("POST", `services/${foreign.id}/duplicate`, ownerCookie),
		call("DELETE", `services/${foreign.id}`, ownerCookie),
		call("GET", "services", ownerCookie, undefined, other.orgId),
	];
	for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);

	const [row] = await db
		.select({ isActive: service.isActive, archivedAt: service.archivedAt })
		.from(service)
		.where(eq(service.id, foreign.id));
	expect(row).toEqual({ isActive: true, archivedAt: null });
	const list = await unwrap<ServiceDto[]>(
		await call("GET", "services", ownerCookie),
	);
	expect(list).toEqual([]);
});

test("inactive organization: writes 409 ORGANIZATION_INACTIVE, reads 200", async () => {
	const created = await create();
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));

	const writes = [
		call("POST", "services", ownerCookie, haircut),
		call("PATCH", `services/${created.id}`, ownerCookie, { isActive: false }),
		call("POST", `services/${created.id}/duplicate`, ownerCookie),
		call("DELETE", `services/${created.id}`, ownerCookie),
	];
	for (const res of await Promise.all(writes)) {
		expect(res.status).toBe(409);
		expect(((await res.json()) as ApiResponse<never>).code).toBe(
			API_ERROR_CODES.ORGANIZATION_INACTIVE,
		);
	}
	expect((await call("GET", "services", ownerCookie)).status).toBe(200);
	expect(
		(await call("GET", `services/${created.id}`, ownerCookie)).status,
	).toBe(200);
});

test("archive hides the service and frees its slug", async () => {
	const first = await create();
	const res = await call("DELETE", `services/${first.id}`, ownerCookie);
	expect(res.status).toBe(200);

	expect((await call("GET", `services/${first.id}`, ownerCookie)).status).toBe(
		404,
	);
	expect(
		(await call("DELETE", `services/${first.id}`, ownerCookie)).status,
	).toBe(404);
	const second = await create();
	expect(second.slug).toBe("haircut");
	expect(second.id).not.toBe(first.id);

	const [row] = await db
		.select({ archivedAt: service.archivedAt })
		.from(service)
		.where(eq(service.id, first.id));
	expect(row?.archivedAt).toBeInstanceOf(Date);
});

test("a second service with the same name gets a distinct slug", async () => {
	await create();
	expect((await create()).slug).toMatch(/^haircut-[a-z0-9]{6}$/);
});

test("duplicate copies the settings, comes back inactive with its own slug", async () => {
	const source = await create({
		...haircut,
		description: "Wash and cut",
		bufferBeforeMinutes: 5,
		bufferAfterMinutes: 10,
	});
	const res = await call(
		"POST",
		`services/${source.id}/duplicate`,
		ownerCookie,
	);
	expect(res.status).toBe(201);
	const copy = await unwrap<ServiceDto>(res);
	expect(copy).toMatchObject({
		name: "Haircut (copy)",
		slug: "haircut-copy",
		description: "Wash and cut",
		durationMinutes: 30,
		priceMinor: 2500,
		currency: source.currency,
		bufferBeforeMinutes: 5,
		bufferAfterMinutes: 10,
		isActive: false,
	});
	expect(copy.id).not.toBe(source.id);

	const again = await unwrap<ServiceDto>(
		await call("POST", `services/${source.id}/duplicate`, ownerCookie),
	);
	expect(again.slug).toMatch(/^haircut-copy-[a-z0-9]{6}$/);
});

test("duplicating a service with a maximum-length name stays within the limit", async () => {
	const source = await create({ ...haircut, name: "x".repeat(100) });
	const copy = await unwrap<ServiceDto>(
		await call("POST", `services/${source.id}/duplicate`, ownerCookie),
	);
	expect(copy.name).toHaveLength(100);
	expect(copy.name.endsWith(" (copy)")).toBe(true);
});

test.each([
	["negative price", { priceMinor: -1 }],
	["fractional price", { priceMinor: 25.5 }],
	["price as a string", { priceMinor: "2500" }],
	["duration under 5", { durationMinutes: 0 }],
	["duration over 720", { durationMinutes: 725 }],
	["duration off the 5-minute grid", { durationMinutes: 32 }],
	["buffer over 240", { bufferAfterMinutes: 245 }],
	["empty name", { name: "  " }],
])("create rejects %s with 400", async (_label, override) => {
	const res = await call("POST", "services", ownerCookie, {
		...haircut,
		...override,
	});
	expect(res.status).toBe(400);
	expect(await db.select({ id: service.id }).from(service)).toEqual([]);
});

test("PATCH rejects out-of-range values with 400", async () => {
	const created = await create();
	for (const body of [{ priceMinor: -5 }, { durationMinutes: 721 }]) {
		const res = await call(
			"PATCH",
			`services/${created.id}`,
			ownerCookie,
			body,
		);
		expect(res.status).toBe(400);
	}
});

test.each([
	["negative price", { priceMinor: -1 }],
	["duration under 5", { durationMinutes: 4 }],
	["duration over 720", { durationMinutes: 721 }],
	["buffer over 240", { bufferBeforeMinutes: 241 }],
	["capacity 0", { capacity: 0 }],
])("the database rejects %s", async (_label, override) => {
	const insert = db.insert(service).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		name: "Haircut",
		slug: "haircut",
		durationMinutes: 30,
		priceMinor: 2500,
		currency: "EUR",
		...override,
	});
	const error = await insert.then(
		() => null,
		(e: Error) => e,
	);
	const cause = error?.cause instanceof Error ? error.cause : error;
	expect(cause?.message).toContain("violates check constraint");
});
