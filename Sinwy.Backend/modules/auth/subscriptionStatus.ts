import { createLogger } from "@logger";
import { setOrganizationStatus } from "@organizationsModule";
import type { WebhookSubscriptionActivePayload } from "@polar-sh/sdk/models/components/webhooksubscriptionactivepayload";
import type { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload";

const webhookLogger = createLogger("auth:polarWebhook");

/**
 * Projects Polar subscription state onto `organization.status`.
 * Polar may redeliver or reorder events, so an event older than the last
 * applied one is ignored.
 */
export const projectSubscriptionStatus = async (
	payload: WebhookSubscriptionActivePayload | WebhookSubscriptionRevokedPayload,
) => {
	const referenceId = payload.data.metadata["referenceId"];
	// no referenceId → subscription not tied to an org, ignore
	if (typeof referenceId !== "string") {
		webhookLogger.warn("Subscription webhook carries no referenceId", {
			type: payload.type,
			subscriptionId: payload.data.id,
		});
		return;
	}

	const status = payload.type === "subscription.active" ? "active" : "inactive";
	const result = await setOrganizationStatus(
		referenceId,
		status,
		payload.timestamp,
	);
	if (result === "unknown") {
		webhookLogger.warn("Subscription webhook references an unknown org", {
			type: payload.type,
			organizationId: referenceId,
			subscriptionId: payload.data.id,
		});
		return;
	}
	if (result === "outdated") {
		webhookLogger.info("Ignored subscription webhook older than org status", {
			type: payload.type,
			organizationId: referenceId,
			subscriptionId: payload.data.id,
			timestamp: payload.timestamp,
		});
		return;
	}

	webhookLogger.info("Organization status projected from subscription", {
		type: payload.type,
		organizationId: referenceId,
		status,
	});
};
