import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import appConfig from "@config";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { webhooks } from "@polar-sh/sdk/2026-10";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import {
	buildPolarDeliveries,
	buildPolarDelivery,
	type PolarDeliveryOptions,
	type PolarEventType,
	polarFixtures,
	sendPolarDelivery,
} from "../simulatePolarWebhook";

let server: Server<never>;
let base: URL;

beforeAll(() => {
	const app = createApp();
	registerAuthRoutes(app);
	server = app.listen(0);
	base = server.url;
});

afterAll(() => server.stop(true));

const orgId = "org_simulate_1";

beforeEach(async () => {
	await db.delete(organization);
	await db.insert(organization).values({
		id: orgId,
		name: "Simulated Org",
		slug: "simulated-org",
		createdAt: new Date(),
	});
});

const storedStatus = async () => (await storedState())?.status;

const storedState = async () => {
	const [row] = await db
		.select({ status: organization.status, plan: organization.plan })
		.from(organization)
		.where(eq(organization.id, orgId));
	return row;
};

const send = (
	type: PolarEventType,
	options: Partial<Omit<PolarDeliveryOptions, "type">> = {},
) =>
	sendPolarDelivery(
		base,
		buildPolarDelivery({ type, organizationId: orgId, ...options }),
	);

for (const type of Object.keys(polarFixtures) as PolarEventType[]) {
	test(`${type} delivery passes the SDK's signature check`, async () => {
		const delivery = buildPolarDelivery({ type, organizationId: orgId });

		const event = await webhooks.validateEvent(
			delivery.body,
			delivery.headers,
			appConfig.POLAR_WEBHOOK_SECRET,
		);

		expect(event.type).toBe(type);
		if (event.type !== type) return;
		expect(event.data.id).toBe(delivery.subscriptionId);
		expect(event.data.metadata["referenceId"]).toBe(orgId);
	});
}

test("subscription.active through the endpoint → org active on the requested plan", async () => {
	expect(await send("subscription.active", { plan: "starter" })).toMatchObject({
		status: 200,
	});
	expect(await storedState()).toEqual({ status: "active", plan: "starter" });
});

test("subscription.updated through the endpoint applies to the bound subscription", async () => {
	const subscriptionId = crypto.randomUUID();
	await send("subscription.active", {
		subscriptionId,
		timestamp: new Date(Date.now() - 60_000),
	});

	// the recorded update is a cancellation
	expect(await send("subscription.updated", { subscriptionId })).toMatchObject({
		status: 200,
	});
	expect(await storedState()).toEqual({ status: "inactive", plan: null });
});

test("subscription.paused alone → 200, ignored: the subscription.updated Polar sends with it projects", async () => {
	const subscriptionId = crypto.randomUUID();
	await send("subscription.active", {
		subscriptionId,
		timestamp: new Date(Date.now() - 60_000),
	});

	expect(await send("subscription.paused", { subscriptionId })).toMatchObject({
		status: 200,
	});
	expect(await storedStatus()).toBe("active");
});

test("subscription.paused as Polar sends it, after a subscription.updated → org suspended, still bound", async () => {
	const subscriptionId = crypto.randomUUID();
	await send("subscription.active", {
		subscriptionId,
		timestamp: new Date(Date.now() - 60_000),
	});

	const deliveries = buildPolarDeliveries({
		type: "subscription.paused",
		organizationId: orgId,
		subscriptionId,
	});
	expect(deliveries.map((delivery) => delivery.type)).toEqual([
		"subscription.updated",
		"subscription.paused",
	]);
	for (const delivery of deliveries)
		expect((await sendPolarDelivery(base, delivery)).status).toBe(200);

	const [row] = await db
		.select({
			status: organization.status,
			subscriptionId: organization.subscriptionId,
		})
		.from(organization)
		.where(eq(organization.id, orgId));
	expect(row).toEqual({ status: "inactive", subscriptionId });
});

test("tampered body → 403, status unchanged", async () => {
	const delivery = buildPolarDelivery({
		type: "subscription.active",
		organizationId: orgId,
	});

	const res = await sendPolarDelivery(base, {
		...delivery,
		body: delivery.body.replace(orgId, "org_other"),
	});

	expect(res.status).toBe(403);
	expect(await storedStatus()).toBe("inactive");
});

test("redelivery of the same event → 200, same state", async () => {
	const delivery = buildPolarDelivery({
		type: "subscription.active",
		organizationId: orgId,
	});

	expect((await sendPolarDelivery(base, delivery)).status).toBe(200);
	expect((await sendPolarDelivery(base, delivery)).status).toBe(200);
	expect(await storedStatus()).toBe("active");
});

test("subscription.revoked delivered before an older subscription.active → inactive", async () => {
	const activatedAt = new Date(Date.now() - 60_000);
	const revokedAt = new Date();

	await send("subscription.revoked", { timestamp: revokedAt });
	await send("subscription.active", { timestamp: activatedAt });

	expect(await storedStatus()).toBe("inactive");
});

test("unknown referenceId → 200, no org changes", async () => {
	const res = await send("subscription.active", {
		organizationId: "org_does_not_exist",
	});

	expect(res.status).toBe(200);
	expect(await storedStatus()).toBe("inactive");
});
