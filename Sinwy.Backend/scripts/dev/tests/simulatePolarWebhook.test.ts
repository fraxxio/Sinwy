import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import appConfig from "@config";
import db from "@db";
import { user, userSubscription } from "@db/schema/userSchema";
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

const userId = "user_simulate_1";

beforeEach(async () => {
	await db.delete(user);
	await db.insert(user).values({
		id: userId,
		name: "Simulated User",
		email: "simulated@test.dev",
		createdAt: new Date(),
		updatedAt: new Date(),
	});
});

/** The user's projected plan; null until an event applied. */
const storedState = async () => {
	const [row] = await db
		.select({
			status: userSubscription.status,
			plan: userSubscription.plan,
			subscriptionId: userSubscription.subscriptionId,
		})
		.from(userSubscription)
		.where(eq(userSubscription.userId, userId));
	return row ?? null;
};

const storedPlan = async () => (await storedState())?.plan ?? null;

const send = (
	type: PolarEventType,
	options: Partial<Omit<PolarDeliveryOptions, "type">> = {},
) => sendPolarDelivery(base, buildPolarDelivery({ type, userId, ...options }));

for (const type of Object.keys(polarFixtures) as PolarEventType[]) {
	test(`${type} delivery passes the SDK's signature check`, async () => {
		const delivery = buildPolarDelivery({ type, userId });

		const event = await webhooks.validateEvent(
			delivery.body,
			delivery.headers,
			appConfig.POLAR_WEBHOOK_SECRET,
		);

		expect(event.type).toBe(type);
		if (event.type !== type) return;
		expect(event.data.id).toBe(delivery.subscriptionId);
		expect(event.data.customer.external_id).toBe(userId);
		expect(event.data.metadata["referenceId"]).toBeUndefined();
	});
}

test("--transfer-id is the only subscription metadata", () => {
	const delivery = buildPolarDelivery({
		type: "subscription.active",
		userId,
		transferId: "transfer_1",
	});
	expect(JSON.parse(delivery.body).data.metadata).toEqual({
		transferId: "transfer_1",
	});
});

test("subscription.active through the endpoint → the user on the requested plan", async () => {
	expect(await send("subscription.active", { plan: "starter" })).toMatchObject({
		status: 200,
	});
	expect(await storedState()).toMatchObject({
		status: "active",
		plan: "starter",
	});
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
	expect(await storedState()).toEqual({
		status: "canceled",
		plan: null,
		subscriptionId: null,
	});
});

test("subscription.paused alone → plan paused, still bound, without the subscription.updated Polar sends first", async () => {
	const subscriptionId = crypto.randomUUID();
	await send("subscription.active", {
		subscriptionId,
		timestamp: new Date(Date.now() - 60_000),
	});

	expect(await send("subscription.paused", { subscriptionId })).toMatchObject({
		status: 200,
	});
	expect(await storedState()).toEqual({
		status: "paused",
		plan: null,
		subscriptionId,
	});
});

test("subscription.resumed alone → the plan is back on the bound subscription", async () => {
	const subscriptionId = crypto.randomUUID();
	await send("subscription.paused", {
		subscriptionId,
		timestamp: new Date(Date.now() - 60_000),
	});

	expect(
		await send("subscription.active", {
			subscriptionId,
			as: "subscription.resumed",
		}),
	).toMatchObject({ status: 200 });
	expect(await storedState()).toEqual({
		status: "active",
		plan: "enterprise",
		subscriptionId,
	});
});

test("an older subscription.paused redelivered after the resume → plan kept", async () => {
	const subscriptionId = crypto.randomUUID();
	const paused = buildPolarDelivery({
		type: "subscription.paused",
		userId,
		subscriptionId,
		timestamp: new Date(Date.now() - 60_000),
	});
	expect((await sendPolarDelivery(base, paused)).status).toBe(200);
	await send("subscription.active", {
		subscriptionId,
		as: "subscription.resumed",
	});

	expect((await sendPolarDelivery(base, paused)).status).toBe(200);
	expect(await storedState()).toMatchObject({ status: "active" });
});

test("subscription.paused as Polar sends it, after a subscription.updated → plan paused, still bound", async () => {
	const subscriptionId = crypto.randomUUID();
	await send("subscription.active", {
		subscriptionId,
		timestamp: new Date(Date.now() - 60_000),
	});

	const deliveries = buildPolarDeliveries({
		type: "subscription.paused",
		userId,
		subscriptionId,
	});
	expect(deliveries.map((delivery) => delivery.type)).toEqual([
		"subscription.updated",
		"subscription.paused",
	]);
	for (const delivery of deliveries)
		expect((await sendPolarDelivery(base, delivery)).status).toBe(200);

	expect(await storedState()).toEqual({
		status: "paused",
		plan: null,
		subscriptionId,
	});
});

test("tampered body → 403, nothing projected", async () => {
	const delivery = buildPolarDelivery({ type: "subscription.active", userId });

	const res = await sendPolarDelivery(base, {
		...delivery,
		body: delivery.body.replace(userId, "user_other"),
	});

	expect(res.status).toBe(403);
	expect(await storedState()).toBeNull();
});

test("redelivery of the same event → 200, same state", async () => {
	const delivery = buildPolarDelivery({ type: "subscription.active", userId });

	expect((await sendPolarDelivery(base, delivery)).status).toBe(200);
	expect((await sendPolarDelivery(base, delivery)).status).toBe(200);
	expect(await storedPlan()).toBe("enterprise");
});

test("subscription.revoked delivered before an older subscription.active → no plan", async () => {
	const activatedAt = new Date(Date.now() - 60_000);
	const revokedAt = new Date();

	await send("subscription.revoked", { timestamp: revokedAt });
	await send("subscription.active", { timestamp: activatedAt });

	expect(await storedPlan()).toBeNull();
});

test("unknown user → 200, nothing projected", async () => {
	const res = await send("subscription.active", {
		userId: "user_does_not_exist",
	});

	expect(res.status).toBe(200);
	expect(await storedState()).toBeNull();
});
