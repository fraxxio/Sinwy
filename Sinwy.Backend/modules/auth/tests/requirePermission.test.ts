import { beforeEach, expect, test } from "bun:test";
import {
	createUserWithSession,
	fakeCtx,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { Permission } from "@sinwy/shared";
import { auth } from "../auth";
import { requireAuth } from "../middleware";
import { membershipFrom, requirePermission } from "../requirePermission";

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
});

let nextCalls = 0;
const next = () => {
	nextCalls++;
	return Promise.resolve(new Response("next"));
};

/** Runs the real requireAuth first so the session comes from the cookie like in production. */
const run = async (
	permission: Permission,
	options: { params?: Record<string, string>; cookie?: string },
) => {
	nextCalls = 0;
	const ctx = fakeCtx(options);
	const res = await requireAuth(ctx, () =>
		requirePermission(permission)(ctx, next),
	);
	return { ctx, res };
};

const seedMember = async (role: string) => {
	const organizationId = await insertOrganization("Acme");
	const { userId, cookie } = await createUserWithSession();
	await joinOrganization(organizationId, userId, role);
	return { organizationId, userId, cookie };
};

test("without requireAuth → throws", () => {
	expect(() => requirePermission("bookings:read")(fakeCtx(), next)).toThrow();
});

test("no organizationId param and no active organization → 400", async () => {
	const { cookie } = await createUserWithSession();
	const { res } = await run("bookings:read", { cookie });
	expect(res.status).toBe(400);
	expect(nextCalls).toBe(0);
});

test("outsider → 404", async () => {
	const organizationId = await insertOrganization("Acme");
	const { cookie } = await createUserWithSession();
	const { res } = await run("bookings:read", {
		params: { organizationId },
		cookie,
	});
	expect(res.status).toBe(404);
});

test("staff: bookings:read passes, settings:manage → 403", async () => {
	const { organizationId, cookie } = await seedMember("staff");
	const params = { organizationId };

	const allowed = await run("bookings:read", { params, cookie });
	expect(allowed.res.status).toBe(200);
	expect(nextCalls).toBe(1);

	const denied = await run("settings:manage", { params, cookie });
	expect(denied.res.status).toBe(403);
	expect(nextCalls).toBe(0);
});

test("billing:manage: admin → 403, owner passes", async () => {
	const admin = await seedMember("admin");
	expect(
		(
			await run("billing:manage", {
				params: { organizationId: admin.organizationId },
				cookie: admin.cookie,
			})
		).res.status,
	).toBe(403);

	const owner = await seedMember("owner");
	expect(
		(
			await run("billing:manage", {
				params: { organizationId: owner.organizationId },
				cookie: owner.cookie,
			})
		).res.status,
	).toBe(200);
});

test("legacy role 'member' → 403", async () => {
	const { organizationId, cookie } = await seedMember("member");
	const { res } = await run("bookings:read", {
		params: { organizationId },
		cookie,
	});
	expect(res.status).toBe(403);
});

test("combined roles are unioned", async () => {
	const { organizationId, cookie } = await seedMember("staff,admin");
	const { res } = await run("settings:manage", {
		params: { organizationId },
		cookie,
	});
	expect(res.status).toBe(200);
});

test("falls back to the session's active organization", async () => {
	const organizationId = await insertOrganization("Acme");
	const { userId, cookie } = await createUserWithSession({
		activeOrganizationId: organizationId,
	});
	await joinOrganization(organizationId, userId, "staff");

	const { ctx, res } = await run("bookings:read", { cookie });
	expect(res.status).toBe(200);
	expect(membershipFrom(ctx).organizationId).toBe(organizationId);
});

test("membershipFrom returns the resolved membership", async () => {
	const { organizationId, cookie } = await seedMember("owner");
	const { ctx } = await run("bookings:read", {
		params: { organizationId },
		cookie,
	});
	expect(membershipFrom(ctx)).toEqual({ organizationId, roles: ["owner"] });
});

test("membershipFrom throws when the middleware did not run", () => {
	expect(() => membershipFrom(fakeCtx())).toThrow();
});

test("better-auth's own hasPermission sees our roles", async () => {
	const organizationId = await insertOrganization("Acme");
	const { userId, cookie } = await createUserWithSession({
		activeOrganizationId: organizationId,
	});
	await joinOrganization(organizationId, userId, "staff");
	const headers = new Headers({ cookie });

	const canWriteBookings = await auth.api.hasPermission({
		headers,
		body: { permissions: { bookings: ["write"] } },
	});
	expect(canWriteBookings.success).toBe(true);

	const canManageSettings = await auth.api.hasPermission({
		headers,
		body: { permissions: { settings: ["manage"] } },
	});
	expect(canManageSettings.success).toBe(false);
});
