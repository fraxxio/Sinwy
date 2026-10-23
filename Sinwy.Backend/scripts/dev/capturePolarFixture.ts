import { join } from "node:path";
import { parseArgs } from "node:util";
import { type PolarModels, polarClient } from "@backend/infrastructure/polar";
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

type WebhookEventType = PolarModels.WebhookEventType;

/** Newest real sandbox delivery of `type`, as Polar sent it. */
export const capturePolarFixture = async (type: WebhookEventType) => {
	const { items } = await polarClient.webhooks.listWebhookDeliveries({
		event_type: type,
		limit: 1,
	});
	const event = items[0]?.webhook_event;
	if (!event?.payload) {
		throw new Error(`No ${type} delivery with a payload in the sandbox`);
	}

	const payload = JSON.parse(event.payload) as { api_version?: string };
	return {
		capturedAt: new Date().toISOString().slice(0, 10),
		// the payload's shape follows the webhook endpoint's API version, not the SDK
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
