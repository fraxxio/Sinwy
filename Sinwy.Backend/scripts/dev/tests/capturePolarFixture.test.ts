import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { polarClient } from "@backend/infrastructure/polar";
import sdkPackage from "@polar-sh/sdk/package.json";
import { capturePolarFixture } from "../capturePolarFixture";
import committed from "../fixtures/polar/subscription.active.json";

const realEmail = "real.customer@gmail.com";
const realAvatar = "https://avatars.example/real-customer.png";

// the committed fixture as Polar delivered it, before its contact details were scrubbed
const deliveredPayload = JSON.stringify(committed.payload)
	.replaceAll("customer@sinwy.test", realEmail)
	.replaceAll("https://www.gravatar.com/avatar/0?d=404", realAvatar);

let listSpy: ReturnType<typeof spyOn>;

beforeAll(() => {
	listSpy = spyOn(
		polarClient.webhooks,
		"listWebhookDeliveries",
	).mockResolvedValue({
		result: {
			items: [
				{ webhookEvent: { id: committed.eventId, payload: deliveredPayload } },
			],
		},
	} as never);
});

afterAll(() => listSpy.mockRestore());

test("asks Polar for the newest delivery of the type", async () => {
	await capturePolarFixture("subscription.active");

	expect(listSpy).toHaveBeenCalledWith({
		eventType: "subscription.active",
		limit: 1,
	});
});

test("drops customer contact details and keeps the rest of the payload", async () => {
	const fixture = await capturePolarFixture("subscription.active");

	const written = JSON.stringify(fixture);
	expect(written).not.toContain(realEmail);
	expect(written).not.toContain(realAvatar);
	expect(fixture.payload).toEqual(committed.payload);
});

test("records the SDK and Polar API versions", async () => {
	const fixture = await capturePolarFixture("subscription.active");

	expect(fixture.sdkVersion).toBe(sdkPackage.version);
	expect(fixture.apiVersion).toBe(committed.apiVersion);
	expect(fixture.eventId).toBe(committed.eventId);
});

test("fails when the sandbox has no delivery of the type", async () => {
	listSpy.mockResolvedValueOnce({ result: { items: [] } } as never);

	await expect(capturePolarFixture("subscription.revoked")).rejects.toThrow(
		"No subscription.revoked delivery",
	);
});
