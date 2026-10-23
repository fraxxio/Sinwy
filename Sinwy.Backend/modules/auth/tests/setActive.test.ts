import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import createApp from "@backend/lib/app";
import {
	activateOrganization,
	createUserWithSession,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { session } from "@db/schema/authSchema";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import { registerAuthRoutes } from "../routes";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

let orgId: string;
let userId: string;
let cookie: string;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	orgId = await insertOrganization("Lockout Co");
	({ userId, cookie } = await createUserWithSession());
	await joinOrganization(orgId, userId, "staff");
});

const setActive = (body: unknown, as = cookie) =>
	fetch(new URL("/api/auth/organization/set-active", base), {
		method: "POST",
		headers: { "content-type": "application/json", cookie: as },
		body: JSON.stringify(body),
	});

const activeOrganizationOf = async (id: string) => {
	const [row] = await db
		.select({ activeOrganizationId: session.activeOrganizationId })
		.from(session)
		.where(eq(session.userId, id));
	return row?.activeOrganizationId;
};

const refusedAsInactive = async (res: Response) => {
	expect(res.status).toBe(403);
	expect(((await res.json()) as { code: string }).code).toBe(
		AUTH_ERROR_CODES.ORGANIZATION_INACTIVE,
	);
};

test("an active organization can be opened, by id or slug", async () => {
	await activateOrganization(orgId);

	expect((await setActive({ organizationId: orgId })).status).toBe(200);
	expect(await activeOrganizationOf(userId)).toBe(orgId);

	expect((await setActive({ organizationSlug: orgId })).status).toBe(200);
});

test("an inactive organization is refused, by id or slug", async () => {
	await refusedAsInactive(await setActive({ organizationId: orgId }));
	await refusedAsInactive(await setActive({ organizationSlug: orgId }));
	expect(await activeOrganizationOf(userId)).toBeNull();
});

test("an organization scheduled for deletion is refused even while active", async () => {
	await activateOrganization(orgId);
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));

	await refusedAsInactive(await setActive({ organizationId: orgId }));
});

test("leaving the organization context stays allowed", async () => {
	await activateOrganization(orgId);
	await setActive({ organizationId: orgId });

	expect((await setActive({ organizationId: null })).status).toBe(200);
	expect(await activeOrganizationOf(userId)).toBeNull();
});

test("a non-member gets the plugin's refusal, not the organization's status", async () => {
	const outsider = await createUserWithSession();

	const res = await setActive({ organizationId: orgId }, outsider.cookie);

	expect(res.status).toBe(403);
	expect(((await res.json()) as { code: string }).code).not.toBe(
		AUTH_ERROR_CODES.ORGANIZATION_INACTIVE,
	);
});
