import { beforeEach, expect, test } from "bun:test";
import {
	activateOrganization,
	createUserWithSession,
	fakeCtx,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { API_ERROR_CODES, type Feature } from "@sinwy/shared";
import { requireAuth } from "../middleware";
import { requireFeature } from "../requireFeature";
import { requirePermission } from "../requirePermission";

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
});

let nextCalls = 0;
const next = () => {
	nextCalls++;
	return Promise.resolve(new Response("next"));
};

const run = (
	feature: Feature,
	options: { params?: Record<string, string>; cookie?: string },
) => {
	nextCalls = 0;
	const ctx = fakeCtx(options);
	return requireAuth(ctx, () => requireFeature(feature)(ctx, next));
};

const seedMember = async () => {
	const organizationId = await insertOrganization("Acme");
	const { userId, cookie } = await createUserWithSession();
	await joinOrganization(organizationId, userId, "staff");
	return { organizationId, params: { organizationId }, cookie };
};

test("inactive org (no plan) → 402 with the upgrade code", async () => {
	const { params, cookie } = await seedMember();
	const res = await run("page-builder", { params, cookie });
	expect(res.status).toBe(402);
	expect(((await res.json()) as { code: number }).code).toBe(
		API_ERROR_CODES.PLAN_UPGRADE_REQUIRED,
	);
	expect(nextCalls).toBe(0);
});

test("plan without the feature → 402", async () => {
	const { organizationId, params, cookie } = await seedMember();
	await activateOrganization(organizationId, "starter");
	expect((await run("page-builder", { params, cookie })).status).toBe(402);
	expect(nextCalls).toBe(0);
});

test("plan with the feature → next", async () => {
	const { organizationId, params, cookie } = await seedMember();
	await activateOrganization(organizationId, "professional");
	expect((await run("page-builder", { params, cookie })).status).toBe(200);
	expect(nextCalls).toBe(1);
});

test("non-member → 404", async () => {
	const organizationId = await insertOrganization("Acme");
	await activateOrganization(organizationId, "enterprise");
	const { cookie } = await createUserWithSession();
	const res = await run("page-builder", { params: { organizationId }, cookie });
	expect(res.status).toBe(404);
});

test("stacks after requirePermission: role first, then plan", async () => {
	const organizationId = await insertOrganization("Acme");
	await activateOrganization(organizationId, "professional");
	const params = { organizationId };
	const guarded = async (role: string) => {
		const { userId, cookie } = await createUserWithSession();
		await joinOrganization(organizationId, userId, role);
		nextCalls = 0;
		const ctx = fakeCtx({ params, cookie });
		return requireAuth(ctx, () =>
			requirePermission("pages:write")(ctx, () =>
				requireFeature("page-builder")(ctx, next),
			),
		);
	};

	// staff may only read pages
	expect((await guarded("staff")).status).toBe(403);
	expect(nextCalls).toBe(0);

	expect((await guarded("admin")).status).toBe(200);
	expect(nextCalls).toBe(1);
});
