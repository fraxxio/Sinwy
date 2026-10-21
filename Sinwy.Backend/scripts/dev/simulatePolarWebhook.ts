import { parseArgs } from "node:util";
import appConfig from "@config";
import { Webhook } from "standardwebhooks";
import { assertLocalDev } from "../assertLocalDev";
import subscriptionActive from "./fixtures/polar/subscription.active.json";
import subscriptionRevoked from "./fixtures/polar/subscription.revoked.json";

export const polarFixtures = {
	"subscription.active": subscriptionActive,
	"subscription.revoked": subscriptionRevoked,
};
export type PolarEventType = keyof typeof polarFixtures;

const isEventType = (type: string): type is PolarEventType =>
	type in polarFixtures;

export type PolarDeliveryOptions = {
	type: PolarEventType;
	organizationId: string;
	subscriptionId?: string;
	timestamp?: Date;
	webhookId?: string;
};

/** A recorded sandbox event with only the ids, `referenceId` and event time replaced, signed like Polar signs it. */
export const buildPolarDelivery = ({
	type,
	organizationId,
	subscriptionId = crypto.randomUUID(),
	timestamp = new Date(),
	webhookId = `msg_${crypto.randomUUID()}`,
}: PolarDeliveryOptions) => {
	const { payload } = polarFixtures[type];
	const body = JSON.stringify({
		...payload,
		timestamp: timestamp.toISOString(),
		data: {
			...payload.data,
			id: subscriptionId,
			metadata: { ...payload.data.metadata, referenceId: organizationId },
		},
	});

	// Polar uses the secret's raw bytes as the key; standardwebhooks takes it base64-encoded
	const signer = new Webhook(
		Buffer.from(appConfig.POLAR_WEBHOOK_SECRET).toString("base64"),
	);
	const sentAt = new Date();
	return {
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
			org: { type: "string" },
			"subscription-id": { type: "string" },
			timestamp: { type: "string" },
			"webhook-id": { type: "string" },
			url: { type: "string", default: `http://localhost:${appConfig.PORT}` },
		},
	});

	const type = values.type ?? "";
	const timestamp = values.timestamp ? new Date(values.timestamp) : undefined;
	if (
		!isEventType(type) ||
		!values.org ||
		(timestamp && Number.isNaN(timestamp.getTime()))
	) {
		console.error(
			`Usage: bun run dev:simulate-polar-webhook --type <${Object.keys(polarFixtures).join("|")}> --org <organizationId> [--subscription-id <id>] [--timestamp <iso>] [--webhook-id <id>] [--url <backend url>]`,
		);
		process.exit(1);
	}

	const delivery = buildPolarDelivery({
		type,
		organizationId: values.org,
		...(values["subscription-id"] && {
			subscriptionId: values["subscription-id"],
		}),
		...(timestamp && { timestamp }),
		...(values["webhook-id"] && { webhookId: values["webhook-id"] }),
	});
	const result = await sendPolarDelivery(values.url, delivery).catch(
		(error: Error) => {
			console.error(`Could not reach ${values.url}: ${error.message}`);
			process.exit(1);
		},
	);

	console.log(
		JSON.stringify(
			{
				type,
				organizationId: values.org,
				subscriptionId: delivery.subscriptionId,
				timestamp: delivery.timestamp,
				webhookId: delivery.webhookId,
				...result,
			},
			null,
			"\t",
		),
	);
	process.exit(result.status === 200 ? 0 : 1);
}
