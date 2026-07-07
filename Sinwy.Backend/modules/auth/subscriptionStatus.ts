import type { WebhookSubscriptionActivePayload } from "@polar-sh/sdk/models/components/webhooksubscriptionactivepayload";
import type { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload";
import { setOrganizationStatus } from "./repository";

/**
 * Projects Polar subscription state onto `organization.status`.
 * Idempotent: a plain status set, safe under webhook re-delivery.
 */
export const projectSubscriptionStatus = async (
	payload: WebhookSubscriptionActivePayload | WebhookSubscriptionRevokedPayload,
) => {
	const referenceId = payload.data.metadata.referenceId;
	// no referenceId → subscription not tied to an org, ignore
	if (typeof referenceId !== "string") return;

	const status = payload.type === "subscription.active" ? "active" : "inactive";
	await setOrganizationStatus(referenceId, status);
};
