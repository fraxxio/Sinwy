import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import { keyFromFileUrl, storageClient } from "@backend/infrastructure/storage";
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
	organizationActivity,
} from "@db/schema/organizationSchema";
import { service, serviceAvailability } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import type {
	ApiResponse,
	OrganizationGeneralDto,
	OrganizationLogoDto,
} from "@sinwy/shared";
import type { Server } from "bun";
import { asc, eq } from "drizzle-orm";
import { registerOrganizationRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	registerOrganizationRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

let orgId: string;
let admin: { userId: string; cookie: string };
let staff: { userId: string; cookie: string };

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Salon");
	await activateOrganization(orgId);
	admin = await createUserWithSession();
	staff = await createUserWithSession();
	await joinOrganization(orgId, admin.userId, "admin");
	await joinOrganization(orgId, staff.userId, "staff");
});

const send = (
	method: string,
	path: string,
	cookie: string,
	body?: unknown,
	organizationId = orgId,
) =>
	fetch(new URL(`/api/organizations/${organizationId}/${path}`, base), {
		method,
		headers: {
			cookie,
			...(body !== undefined && !(body instanceof FormData)
				? { "content-type": "application/json" }
				: {}),
		},
		body:
			body instanceof FormData || body === undefined
				? body
				: JSON.stringify(body),
	});

const logoForm = (bytes: Uint8Array, type = "image/png") => {
	const form = new FormData();
	form.set("file", new File([bytes], "logo.png", { type }));
	return form;
};

const general = async () => {
	const res = await send("GET", "general", admin.cookie);
	const body = (await res.json()) as ApiResponse<OrganizationGeneralDto>;
	if (!body.isSuccess) throw new Error(body.message);
	return body.data;
};

const uploadLogo = async () => {
	const res = await send("POST", "logo", admin.cookie, logoForm(PNG));
	const body = (await res.json()) as ApiResponse<OrganizationLogoDto>;
	if (!body.isSuccess) throw new Error(body.message);
	return body.data.logo;
};

const stored = async (url: string) => {
	const key = keyFromFileUrl(url);
	if (!key) throw new Error(`not our URL: ${url}`);
	return (await storageClient.serve(key)).status;
};

const actions = async () =>
	(
		await db
			.select({
				action: organizationActivity.action,
				details: organizationActivity.details,
			})
			.from(organizationActivity)
			.where(eq(organizationActivity.organizationId, orgId))
			.orderBy(asc(organizationActivity.id))
	).filter((row) => row.action !== "organization.activated");

test("an admin renames, changes the timezone and uploads a logo; the slug never moves", async () => {
	const { slug } = await general();

	expect(
		(await send("PUT", "name", admin.cookie, { name: "  Studio  " })).status,
	).toBe(200);
	expect(
		(
			await send("PUT", "timezone", admin.cookie, {
				timezone: "Europe/Berlin",
			})
		).status,
	).toBe(200);
	const logo = await uploadLogo();

	expect(logo).toMatch(new RegExp(`/api/files/logos/${orgId}/[\\w-]+\\.png$`));
	expect(await stored(logo)).toBe(200);
	expect(await general()).toMatchObject({
		name: "Studio",
		slug,
		logo,
		timezone: "Europe/Berlin",
	});
	expect(await actions()).toEqual([
		{
			action: "organization.renamed",
			details: { fromName: "Salon", toName: "Studio" },
		},
		{
			action: "organization.timezone_changed",
			details: { fromTimezone: "UTC", toTimezone: "Europe/Berlin" },
		},
		{ action: "organization.logo_changed", details: {} },
	]);
});

test("saving the same name or timezone records nothing", async () => {
	await send("PUT", "name", admin.cookie, { name: "Salon" });
	await send("PUT", "timezone", admin.cookie, { timezone: "UTC" });
	expect(await actions()).toEqual([]);
});

test("a new logo replaces the old file, and removing it deletes the file", async () => {
	const first = await uploadLogo();
	const second = await uploadLogo();
	expect(await stored(first)).toBe(404);
	expect(await stored(second)).toBe(200);

	expect((await send("DELETE", "logo", admin.cookie)).status).toBe(200);
	expect(await stored(second)).toBe(404);
	expect((await general()).logo).toBeNull();
	expect((await actions()).map((row) => row.action)).toEqual([
		"organization.logo_changed",
		"organization.logo_changed",
		"organization.logo_removed",
	]);
});

test("a spoofed image and a bad name or zone are refused, and nothing changes", async () => {
	const spoofed = await send(
		"POST",
		"logo",
		admin.cookie,
		logoForm(new TextEncoder().encode("<svg onload=alert(1)>")),
	);
	expect(spoofed.status).toBe(400);
	for (const name of ["", "   ", "x".repeat(101)])
		expect((await send("PUT", "name", admin.cookie, { name })).status).toBe(
			400,
		);
	for (const timezone of ["Mars/Olympus", "+02:00", 3])
		expect(
			(await send("PUT", "timezone", admin.cookie, { timezone })).status,
		).toBe(400);

	expect(await general()).toMatchObject({
		name: "Salon",
		logo: null,
		timezone: "UTC",
	});
	expect(await actions()).toEqual([]);
});

test("staff and non-members can't read or change General", async () => {
	const outsider = await createUserWithSession();
	const attempts = (cookie: string) => [
		send("GET", "general", cookie),
		send("PUT", "name", cookie, { name: "Taken" }),
		send("PUT", "timezone", cookie, { timezone: "Europe/Berlin" }),
		send("POST", "logo", cookie, logoForm(PNG)),
		send("DELETE", "logo", cookie),
	];
	for (const res of await Promise.all(attempts(staff.cookie)))
		expect(res.status).toBe(403);
	for (const res of await Promise.all(attempts(outsider.cookie)))
		expect(res.status).toBe(404);

	const [row] = await db
		.select({
			name: organization.name,
			timezone: organization.timezone,
			logo: organization.logo,
		})
		.from(organization)
		.where(eq(organization.id, orgId));
	expect(row).toEqual({ name: "Salon", timezone: "UTC", logo: null });
});

test("an inactive organization refuses changes", async () => {
	await db
		.update(organization)
		.set({ slotHeldAt: null })
		.where(eq(organization.id, orgId));

	for (const res of [
		await send("PUT", "name", admin.cookie, { name: "Taken" }),
		await send("PUT", "timezone", admin.cookie, { timezone: "Europe/Berlin" }),
		await send("POST", "logo", admin.cookie, logoForm(PNG)),
	])
		expect(res.status).toBe(409);
	expect((await general()).name).toBe("Salon");
});

test("changing the timezone leaves booking instants and hour rows untouched", async () => {
	const serviceId = crypto.randomUUID();
	await db.insert(service).values({
		id: serviceId,
		organizationId: orgId,
		name: "Haircut",
		slug: "haircut",
		durationMinutes: 30,
		priceMinor: 2500,
		currency: "EUR",
	});
	await db.insert(serviceAvailability).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		weekday: 1,
		startTime: "09:00",
		endTime: "17:00",
	});
	const startsAt = new Date("2030-01-07T08:00:00Z");
	await db.insert(booking).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		serviceId,
		bookedBy: "organization",
		customerName: "Ona",
		customerEmail: "ona@example.com",
		startsAt,
		endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 0,
		priceMinor: 2500,
		currency: "EUR",
		status: "confirmed",
	});

	await send("PUT", "timezone", admin.cookie, { timezone: "Europe/Berlin" });

	const bookings = await db
		.select({ startsAt: booking.startsAt })
		.from(booking)
		.where(eq(booking.organizationId, orgId));
	expect(bookings).toEqual([{ startsAt }]);
	const hours = await db
		.select({
			weekday: serviceAvailability.weekday,
			startTime: serviceAvailability.startTime,
			endTime: serviceAvailability.endTime,
		})
		.from(serviceAvailability)
		.where(eq(serviceAvailability.organizationId, orgId));
	expect(hours).toEqual([
		{ weekday: 1, startTime: "09:00:00", endTime: "17:00:00" },
	]);
});

test("a profile save records the changed field names, never their values", async () => {
	const profile = {
		tagline: "Sharp cuts",
		description: "A neighbourhood salon.",
		email: "hello@salon.test",
		phone: "+370 600 00000",
		website: "",
		city: "Vilnius",
		country: "LT",
	};
	expect((await send("PUT", "profile", admin.cookie, profile)).status).toBe(
		200,
	);
	await send("PUT", "profile", admin.cookie, profile);
	await send("PUT", "profile", admin.cookie, {
		...profile,
		email: "new@salon.test",
	});

	const recorded = await actions();
	expect(recorded).toEqual([
		{
			action: "organization.profile_updated",
			details: {
				fields: ["tagline", "description", "email", "phone", "city", "country"],
			},
		},
		{
			action: "organization.profile_updated",
			details: { fields: ["email"] },
		},
	]);
	expect(JSON.stringify(recorded)).not.toContain("salon.test");
});
