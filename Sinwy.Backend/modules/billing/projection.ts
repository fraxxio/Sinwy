import { planFor, polarClient } from "@backend/infrastructure/polar";
import { createLogger } from "@logger";
import {
	activateSubscription,
	deactivateSubscription,
	getSubscriptionState,
} from "@organizationsModule";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import type { OrganizationStatus } from "@sinwy/shared";

const billingLogger = createLogger("billing:projection");

// past_due keeps access: Polar's dunning retries are the grace period
const ENTITLED_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

const planOf = (subscription: Subscription) => {
	const plan = planFor(subscription.productId);
	if (!plan)
		billingLogger.error("Subscription product maps to no plan", {
			subscriptionId: subscription.id,
			productId: subscription.productId,
		});
	return plan;
};

/**
 * Projects a Polar subscription onto its organization (`status`, `plan`,
 * `subscription_id`). State is derived from the subscription object only,
 * so re-delivery and overlapping events converge on the same result.
 * Returns the status written, or null when the organization was left as is.
 */
export const projectSubscription = async (
	subscription: Subscription,
): Promise<OrganizationStatus | null> => {
	const organizationId = subscription.metadata["referenceId"];
	if (typeof organizationId !== "string") {
		billingLogger.warn("Subscription carries no referenceId", {
			subscriptionId: subscription.id,
		});
		return null;
	}

	const entitled = ENTITLED_STATUSES.includes(subscription.status);
	const applied = entitled
		? await activateSubscription(
				organizationId,
				subscription.id,
				planOf(subscription),
			)
		: await deactivateSubscription(organizationId, subscription.id);

	const context = {
		organizationId,
		subscriptionId: subscription.id,
		subscriptionStatus: subscription.status,
	};
	if (applied) {
		billingLogger.info("Organization projected from subscription", context);
		return entitled ? "active" : "inactive";
	}

	const current = await getSubscriptionState(organizationId);
	if (!current)
		billingLogger.warn("Subscription references an unknown org", context);
	else if (entitled)
		// two checkouts raced (e.g. two tabs): the org keeps the first one
		billingLogger.error(
			"Second active subscription for an organization; refund it in Polar",
			{ ...context, boundSubscriptionId: current.subscriptionId },
		);
	else
		billingLogger.warn("Ignored a subscription the org no longer uses", {
			...context,
			boundSubscriptionId: current.subscriptionId,
		});
	return null;
};

/**
 * Webhook entry point. Payloads can be retried late or arrive out of order,
 * so the subscription is re-read from Polar instead of trusting the snapshot.
 * A failed read throws, which makes Polar retry the delivery.
 */
export const syncSubscription = async (subscriptionId: string) => {
	const subscription = await polarClient.subscriptions.get({
		id: subscriptionId,
	});
	await projectSubscription(subscription);
};

/**
 * Backstop for a webhook that never landed: an inactive organization asks
 * Polar for an active subscription and activates on positive evidence only.
 * Never deactivates, since a failed lookup must not lock out a paying org.
 * Returns whether the organization is now active.
 */
export const reconcileInactiveOrganization = async (organizationId: string) => {
	const subscriptions = await polarClient.subscriptions
		.list({
			metadata: { referenceId: organizationId },
			active: true,
			limit: 1,
		})
		.catch((error: unknown) => {
			billingLogger.warn("Polar subscription lookup failed", {
				organizationId,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		});

	const subscription = subscriptions?.result.items[0];
	if (!subscription) return false;

	const activated = (await projectSubscription(subscription)) === "active";
	if (activated)
		billingLogger.info("Activated from Polar after a missed webhook", {
			organizationId,
			subscriptionId: subscription.id,
		});
	return activated;
};
