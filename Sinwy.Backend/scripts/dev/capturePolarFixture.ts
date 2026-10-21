import { join } from "node:path";
import { parseArgs } from "node:util";
import { polarClient } from "@backend/infrastructure/polar";
import type { WebhookEventType } from "@polar-sh/sdk/models/components/webhookeventtype";
import sdkPackage from "@polar-sh/sdk/package.json";
import { assertLocalDev } from "../assertLocalDev";

const fixturesDir = join(import.meta.dir, "fixtures/polar");

// fixtures are committed, so drop the sandbox customer's contact details
const scrub = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(scrub);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, field]) => {
			if (key === "email" && typeof field === "string") {
				return [key, "customer@sinwy.test"];
			}
			if (key === "avatar_url" && typeof field === "string") {
				return [key, "https://www.gravatar.com/avatar/0?d=404"];
			}
			return [key, scrub(field)];
		}),
	);
};

/** Newest real sandbox delivery of `type`, as Polar sent it. */
export const capturePolarFixture = async (type: WebhookEventType) => {
	const { result } = await polarClient.webhooks.listWebhookDeliveries({
		eventType: type,
		limit: 1,
	});
	const event = result.items[0]?.webhookEvent;
	if (!event?.payload) {
		throw new Error(`No ${type} delivery with a payload in the sandbox`);
	}

	const payload = JSON.parse(event.payload) as { api_version?: string };
	return {
		capturedAt: new Date().toISOString().slice(0, 10),
		sdkVersion: sdkPackage.version,
		apiVersion: payload.api_version,
		eventId: event.id,
		payload: scrub(payload),
	};
};

if (import.meta.main) {
	assertLocalDev("capture a Polar fixture");

	const { values } = parseArgs({ options: { type: { type: "string" } } });
	if (!values.type) {
		console.error(
			"Usage: bun run dev:capture-polar-fixture --type <event type>",
		);
		process.exit(1);
	}

	const fixture = await capturePolarFixture(
		values.type as WebhookEventType,
	).catch((error: Error) => {
		console.error(error.message);
		process.exit(1);
	});
	const file = join(fixturesDir, `${values.type}.json`);
	await Bun.write(file, `${JSON.stringify(fixture, null, "\t")}\n`);
	console.log(`Wrote ${file} from event ${fixture.eventId}`);
	process.exit(0);
}
