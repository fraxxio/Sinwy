import { parseArgs } from "node:util";
import { productIdFor } from "@backend/infrastructure/polar";
import appConfig from "@config";
import { PLAN_SLUGS, type PlanSlug, toPlanSlug } from "@sinwy/shared";
import { Webhook } from "standardwebhooks";
import { assertLocalDev } from "../assertLocalDev";
import subscriptionActive from "./fixtures/polar/subscription.active.json";
import subscriptionPaused from "./fixtures/polar/subscription.paused.json";
import subscriptionRevoked from "./fixtures/polar/subscription.revoked.json";
import subscriptionUpdated from "./fixtures/polar/subscription.updated.json";

export const polarFixtures = {
	"subscription.active": subscriptionActive,
	"subscription.updated": subscriptionUpdated,
	"subscription.revoked": subscriptionRevoked,
	"subscription.paused": subscriptionPaused,
};
export type PolarEventType = keyof typeof polarFixtures;

const isEventType = (type: string): type is PolarEventType =>
	type in polarFixtures;

export type PolarDeliveryOptions = {
	type: PolarEventType;
	/** The app user whose Polar customer holds the subscription. */
	userId: string;
	subscriptionId?: string;
	plan?: PlanSlug;
	/** Marks it as bought on accepting this ownership transfer. */
	transferId?: string;
	timestamp?: Date;
	webhookId?: string;
	/** Sends the fixture's data under another event type. */
	as?: "subscription.updated" | "subscription.resumed";
};

// Polar sends these right after a subscription.updated with the same data
const SENT_AFTER_AN_UPDATE: readonly PolarEventType[] = ["subscription.paused"];

/**
 * A recorded sandbox event with only the ids, the customer's `external_id`,
 * product, metadata and times replaced, signed like Polar signs it. The product is this
 * environment's one for `plan`. `timestamp` is both the event time and the
 * subscription's `modified_at`, which orders the projection.
 */
export const buildPolarDelivery = ({
	type,
	userId,
	subscriptionId = crypto.randomUUID(),
	plan = "enterprise",
	transferId,
	timestamp = new Date(),
	webhookId = `msg_${crypto.randomUUID()}`,
	as,
}: PolarDeliveryOptions) => {
	const { payload } = polarFixtures[type];
	const body = JSON.stringify({
		...payload,
		...(as && { type: as }),
		timestamp: timestamp.toISOString(),
		data: {
			...payload.data,
			id: subscriptionId,
			product_id: productIdFor(plan),
			product: { ...payload.data.product, id: productIdFor(plan) },
			modified_at: timestamp.toISOString(),
			customer: { ...payload.data.customer, external_id: userId },
			metadata: transferId ? { transferId } : {},
		},
	});

	// Polar uses the secret's raw bytes as the key; standardwebhooks takes it base64-encoded
	const signer = new Webhook(
		Buffer.from(appConfig.POLAR_WEBHOOK_SECRET).toString("base64"),
	);
	const sentAt = new Date();
	return {
		type: as ?? type,
		webhookId,
		subscriptionId,
		timestamp: timestamp.toISOString(),
		body,
		headers: {
			"content-type": "application/json",
			"webhook-id": webhookId,
			"webhook-timestamp": Math.floor(sentAt.getTime() / 1000).toString(),
			"webhook-signature": signer.sign(webhookId, sentAt, body),
		},
	};
};

/**
 * The deliveries Polar makes for `type`, in order: one, or the
 * subscription.updated it sends first. Only the last uses `webhookId`.
 */
export const buildPolarDeliveries = (
	options: Omit<PolarDeliveryOptions, "as">,
) => {
	const subscriptionId = options.subscriptionId ?? crypto.randomUUID();
	const timestamp = options.timestamp ?? new Date();
	const event = buildPolarDelivery({ ...options, subscriptionId, timestamp });
	if (!SENT_AFTER_AN_UPDATE.includes(options.type)) return [event];
	const { webhookId: _, ...update } = options;
	return [
		buildPolarDelivery({
			...update,
			subscriptionId,
			timestamp,
			as: "subscription.updated",
		}),
		event,
	];
};

export const sendPolarDelivery = async (
	baseUrl: string | URL,
	{
		body,
		headers,
	}: Pick<ReturnType<typeof buildPolarDelivery>, "body" | "headers">,
) => {
	const res = await fetch(new URL("/api/auth/polar/webhooks", baseUrl), {
		method: "POST",
		headers,
		body,
	});
	return { status: res.status, response: await res.text() };
};

if (import.meta.main) {
	assertLocalDev("send a Polar webhook");

	const { values } = parseArgs({
		options: {
			type: { type: "string" },
			user: { type: "string" },
			"subscription-id": { type: "string" },
			plan: { type: "string" },
			"transfer-id": { type: "string" },
			timestamp: { type: "string" },
			"webhook-id": { type: "string" },
			url: { type: "string", default: `http://localhost:${appConfig.PORT}` },
		},
	});

	const type = values.type ?? "";
	const timestamp = values.timestamp ? new Date(values.timestamp) : undefined;
	const plan = values.plan ? toPlanSlug(values.plan) : undefined;
	if (
		!isEventType(type) ||
		!values.user ||
		plan === null ||
		(timestamp && Number.isNaN(timestamp.getTime()))
	) {
		console.error(
			`Usage: bun run dev:simulate-polar-webhook --type <${Object.keys(polarFixtures).join("|")}> --user <userId> [--subscription-id <id>] [--plan <${PLAN_SLUGS.join("|")}>] [--transfer-id <id>] [--timestamp <iso>] [--webhook-id <id>] [--url <backend url>]`,
		);
		process.exit(1);
	}

	const deliveries = buildPolarDeliveries({
		type,
		userId: values.user,
		...(values["subscription-id"] && {
			subscriptionId: values["subscription-id"],
		}),
		...(plan && { plan }),
		...(values["transfer-id"] && { transferId: values["transfer-id"] }),
		...(timestamp && { timestamp }),
		...(values["webhook-id"] && { webhookId: values["webhook-id"] }),
	});
	let failed = false;
	for (const delivery of deliveries) {
		const result = await sendPolarDelivery(values.url, delivery).catch(
			(error: Error) => {
				console.error(`Could not reach ${values.url}: ${error.message}`);
				process.exit(1);
			},
		);
		failed ||= result.status !== 200;
		console.log(
			JSON.stringify(
				{
					type: delivery.type,
					userId: values.user,
					subscriptionId: delivery.subscriptionId,
					timestamp: delivery.timestamp,
					webhookId: delivery.webhookId,
					...result,
				},
				null,
				"\t",
			),
		);
	}
	process.exit(failed ? 1 : 0);
}
