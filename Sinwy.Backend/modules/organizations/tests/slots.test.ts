import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import { type PolarModels, productIdFor } from "@backend/infrastructure/polar";
import createApp from "@backend/lib/app";
import {
	createUserWithSession,
	givePlan,
	insertOrganization,
	joinOrganization,
} from "@backend/test/helpers";
import { applySubscriptionEvent } from "@billingModule";
import db from "@db";
import { session } from "@db/schema/authSchema";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { API_ERROR_CODES, type ApiResponse } from "@sinwy/shared";
import type { Server } from "bun";
import { eq, isNotNull } from "drizzle-orm";
import { registerOrganizationRoutes } from "../routes";
import { countHeldSlots, getOrganizationState } from "../service";

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

let userId: string;
let cookie: string;

beforeEach(async () => {
	await db.delete(organization);
	await db.delete(user);
	({ userId, cookie } = await createUserWithSession());
});

const ownedOrg = async (name: string) => {
	const id = await insertOrganization(name);
	await joinOrganization(id, userId, "owner");
	return id;
};

const slot = (
	action: "activate" | "deactivate",
	organizationId: string,
	as = cookie,
) =>
	fetch(
		new URL(`/api/account/organizations/${organizationId}/${action}`, base),
		{ method: "POST", headers: { cookie: as } },
	);

const codeOf = async (res: Response) =>
	((await res.json()) as ApiResponse).code;

const statusOf = async (organizationId: string) =>
	(await getOrganizationState(organizationId))?.status;

test("activate takes a slot on the owner's plan; deactivate frees it for another org", async () => {
	await givePlan(userId, "starter");
	const first = await ownedOrg("First");
	const second = await ownedOrg("Second");

	expect((await slot("activate", first)).status).toBe(200);
	expect(await statusOf(first)).toBe("active");

	const refused = await slot("activate", second);
	expect(refused.status).toBe(409);
	expect(await codeOf(refused)).toBe(
		API_ERROR_CODES.ORGANIZATION_LIMIT_REACHED,
	);
	expect(await statusOf(second)).toBe("inactive");

	expect((await slot("deactivate", first)).status).toBe(200);
	expect(await statusOf(first)).toBe("inactive");
	expect((await slot("activate", second)).status).toBe(200);
	expect(await statusOf(second)).toBe("active");
});

test("deactivate takes the org out of the sessions that have it open, leaving others alone", async () => {
	await givePlan(userId, "professional");
	const closed = await ownedOrg("Closed");
	const kept = await ownedOrg("Kept");
	expect((await slot("activate", closed)).status).toBe(200);
	expect((await slot("activate", kept)).status).toBe(200);
	const inClosed = await createUserWithSession({
		activeOrganizationId: closed,
	});
	const inKept = await createUserWithSession({ activeOrganizationId: kept });
	const activeOrganizationOf = async (id: string) => {
		const [row] = await db
			.select({ activeOrganizationId: session.activeOrganizationId })
			.from(session)
			.where(eq(session.userId, id));
		return row?.activeOrganizationId;
	};

	expect((await slot("deactivate", closed)).status).toBe(200);

	expect(await activeOrganizationOf(inClosed.userId)).toBeNull();
	expect(await activeOrganizationOf(inKept.userId)).toBe(kept);
});

test("activating an org that already holds a slot is a no-op success", async () => {
	await givePlan(userId, "starter");
	const orgId = await ownedOrg("Once");
	expect((await slot("activate", orgId)).status).toBe(200);
	expect((await slot("activate", orgId)).status).toBe(200);
});

test("each tier's cap: Professional 2, Enterprise 5", async () => {
	for (const [plan, cap] of [
		["professional", 2],
		["enterprise", 5],
	] as const) {
		await db.delete(organization);
		await givePlan(userId, plan);
		const ids = [];
		for (let n = 0; n <= cap; n++) ids.push(await ownedOrg(`${plan} ${n}`));
		const results = [];
		for (const id of ids) results.push((await slot("activate", id)).status);
		expect(results).toEqual([...Array(cap).fill(200), 409]);
	}
});

test("two concurrent activations at the cap: exactly one wins", async () => {
	await givePlan(userId, "starter");
	const ids = await Promise.all(["A", "B", "C"].map((name) => ownedOrg(name)));

	const results = await Promise.all(ids.map((id) => slot("activate", id)));

	expect(results.map((res) => res.status).sort()).toEqual([200, 409, 409]);
	const held = await db
		.select({ id: organization.id })
		.from(organization)
		.where(isNotNull(organization.slotHeldAt));
	expect(held).toHaveLength(1);
});

test("a lower cap landing during an activation: the cap holds either way", async () => {
	await givePlan(userId, "professional");
	const first = await ownedOrg("First");
	const second = await ownedOrg("Second");
	expect((await slot("activate", first)).status).toBe(200);

	await Promise.all([
		applySubscriptionEvent({
			data: {
				id: `sub_${userId}`,
				status: "active",
				product_id: productIdFor("starter"),
				customer: { external_id: userId },
				metadata: {},
				created_at: new Date().toISOString(),
				modified_at: new Date().toISOString(),
			} as PolarModels.Subscription,
		}),
		slot("activate", second),
	]);

	expect(await countHeldSlots(userId)).toBe(1);
});

test("without a plan that grants access → 409 PLAN_REQUIRED; a paused plan counts as none", async () => {
	const orgId = await ownedOrg("Draft");
	const none = await slot("activate", orgId);
	expect(none.status).toBe(409);
	expect(await codeOf(none)).toBe(API_ERROR_CODES.PLAN_REQUIRED);

	await givePlan(userId, null, { status: "paused" });
	expect(await codeOf(await slot("activate", orgId))).toBe(
		API_ERROR_CODES.PLAN_REQUIRED,
	);
});

test("owner only: an admin, an outsider and an org scheduled for deletion → 404", async () => {
	await givePlan(userId, "starter");
	const orgId = await ownedOrg("Mine");
	const admin = await createUserWithSession();
	await joinOrganization(orgId, admin.userId, "admin");
	await givePlan(admin.userId, "enterprise");
	const outsider = await createUserWithSession();

	for (const action of ["activate", "deactivate"] as const) {
		expect((await slot(action, orgId, admin.cookie)).status).toBe(404);
		expect((await slot(action, orgId, outsider.cookie)).status).toBe(404);
	}

	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, orgId));
	expect((await slot("activate", orgId)).status).toBe(404);
	expect((await slot("deactivate", orgId)).status).toBe(404);
});

test("an org scheduled for deletion frees its slot at once", async () => {
	await givePlan(userId, "starter");
	const scheduled = await ownedOrg("Leaving");
	const next = await ownedOrg("Next");
	await slot("activate", scheduled);
	await db
		.update(organization)
		.set({ deletionScheduledAt: new Date() })
		.where(eq(organization.id, scheduled));

	expect((await slot("activate", next)).status).toBe(200);
});

test("no session → 401", async () => {
	const orgId = await ownedOrg("Any");
	expect((await slot("activate", orgId, "")).status).toBe(401);
});
