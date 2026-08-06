import { polarClient } from "@authModule";
import { createLogger } from "@logger";
import type { OrganizationStatus } from "@sinwy/shared";
import { setStatus } from "./repository";

const reconcileLogger = createLogger("organizations:reconcile");

/**
 * Backstop for a `subscription.active` webhook that never landed. Polar owns
 * billing state; `organization.status` only caches it, so a dropped delivery
 * strands the organization until something asks Polar again.
 *
 * Upgrades on positive evidence only — never active → inactive, since a failed
 * lookup would otherwise deactivate a paying organization. Revocation stays
 * webhook-driven.
 */
export const reconcileInactiveStatus = async (
	organizationId: string,
): Promise<OrganizationStatus> => {
	const subscriptions = await polarClient.subscriptions
		.list({
			metadata: { referenceId: organizationId },
			active: true,
			limit: 1,
		})
		.catch((error: unknown) => {
			reconcileLogger.warn("Polar subscription lookup failed", {
				organizationId,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		});

	const subscription = subscriptions?.result.items[0];
	if (!subscription) return "inactive";

	await setStatus(organizationId, "active");
	reconcileLogger.info("Activated from Polar after a missed webhook", {
		organizationId,
		subscriptionId: subscription.id,
	});
	return "active";
};
