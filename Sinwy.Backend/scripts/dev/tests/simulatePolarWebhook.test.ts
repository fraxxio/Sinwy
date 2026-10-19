import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import appConfig from "@config";
import db from "@db";
import { organization } from "@db/schema/organizationSchema";
import { validateEvent } from "@polar-sh/sdk/webhooks";
import type { Server } from "bun";
import { eq } from "drizzle-orm";
import {
	buildPolarDelivery,
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

const storedStatus = async () => {
	const [row] = await db
		.select({ status: organization.status })
		.from(organization)
		.where(eq(organization.id, orgId));
	return row?.status;
};

const send = (
	type: PolarEventType,
	options: { timestamp?: Date; organizationId?: string } = {},
) =>
	sendPolarDelivery(
		base,
		buildPolarDelivery({ type, organizationId: orgId, ...options }),
	);

for (const type of Object.keys(polarFixtures) as PolarEventType[]) {
	test(`${type} fixture verifies and parses with the SDK`, () => {
		const delivery = buildPolarDelivery({ type, organizationId: orgId });

		const event = validateEvent(
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

test("subscription.active through the endpoint → org active", async () => {
	expect(await send("subscription.active")).toMatchObject({ status: 200 });
	expect(await storedStatus()).toBe("active");
});

test("tampered body → 400, status unchanged", async () => {
	const delivery = buildPolarDelivery({
		type: "subscription.active",
		organizationId: orgId,
	});

	const res = await sendPolarDelivery(base, {
		...delivery,
		body: delivery.body.replace(orgId, "org_other"),
	});

	expect(res.status).toBe(400);
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
