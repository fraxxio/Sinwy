import {
	describePolarError,
	type PolarModels,
	planFor,
	polarClient,
} from "@backend/infrastructure/polar";
import { createLogger } from "@logger";
import {
	activateSubscription,
	deactivateSubscription,
} from "@organizationsModule";
import type { OrganizationStatus } from "@sinwy/shared";

type Subscription = PolarModels.Subscription;

const billingLogger = createLogger("billing:projection");

// past_due keeps access: Polar's dunning retries are the grace period
const ENTITLED_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

const planOf = (subscription: Subscription) => {
	const plan = planFor(subscription.product_id);
	if (!plan)
		billingLogger.error("Subscription product maps to no plan", {
			subscriptionId: subscription.id,
			productId: subscription.product_id,
		});
	return plan;
};

/**
 * Projects a Polar subscription onto its organization (`status`, `plan`,
 * `subscription_id`). State is derived from the subscription object only,
 * so re-delivery and overlapping events converge on the same result.
 * State is ordered by Polar's own modification time, whichever path
 * (webhook, reconcile, plan change) delivers it; anything not newer than the
 * applied state is ignored. Returns the status written, or null when the
 * organization was left as is.
 */
export const projectSubscription = async (
	subscription: Subscription,
): Promise<OrganizationStatus | null> => {
	const observedAt = new Date(
		subscription.modified_at ?? subscription.created_at,
	);
	const organizationId = subscription.metadata["referenceId"];
	if (typeof organizationId !== "string") {
		billingLogger.warn("Subscription carries no referenceId", {
			subscriptionId: subscription.id,
		});
		return null;
	}

	const entitled = ENTITLED_STATUSES.includes(subscription.status);
	const write = entitled
		? await activateSubscription(
				organizationId,
				subscription.id,
				planOf(subscription),
				observedAt,
			)
		: await deactivateSubscription(organizationId, subscription.id, observedAt);

	const context = {
		organizationId,
		subscriptionId: subscription.id,
		subscriptionStatus: subscription.status,
	};
	switch (write.result) {
		case "applied":
			billingLogger.info("Organization projected from subscription", context);
			return entitled ? "active" : "inactive";
		case "unknown-organization":
			billingLogger.warn("Subscription references an unknown org", context);
			return null;
		case "outdated":
			// routine: redeliveries, and every billing page load re-projects
			billingLogger.debug(
				"Ignored subscription state not newer than the applied one",
				{ ...context, observedAt: observedAt.toISOString() },
			);
			return null;
		case "bound-elsewhere": {
			const bound = {
				...context,
				boundSubscriptionId: write.boundSubscriptionId,
			};
			if (entitled)
				// two checkouts raced (e.g. two tabs): the org keeps the first one
				billingLogger.error(
					"Second active subscription for an organization; refund it in Polar",
					bound,
				);
			else
				billingLogger.warn(
					"Ignored a subscription the org no longer uses",
					bound,
				);
			return null;
		}
	}
};

/** Webhook entry point. Late retries and reordered events lose to the newer state. */
export const applySubscriptionEvent = async (event: { data: Subscription }) => {
	await projectSubscription(event.data);
};

/**
 * Subscriptions of the organization that still grant access, across pages.
 * Polar's `active` filter leaves out past_due, hence the filter here.
 */
export const listEntitledSubscriptions = async (organizationId: string) => {
	const entitled: Subscription[] = [];
	const subscriptions = polarClient.subscriptions.iterList({
		metadata: { referenceId: organizationId },
		limit: 100,
	});
	for await (const subscription of subscriptions)
		if (ENTITLED_STATUSES.includes(subscription.status))
			entitled.push(subscription);
	return entitled;
};

/**
 * Backstop for a webhook that never landed: an inactive organization asks
 * Polar for an entitled subscription and activates on positive evidence only.
 * Never deactivates, since a failed lookup must not lock out a paying org.
 * Returns whether the organization is now active.
 */
export const reconcileInactiveOrganization = async (organizationId: string) => {
	const subscriptions = await listEntitledSubscriptions(organizationId).catch(
		(error: unknown) => {
			billingLogger.warn("Polar subscription lookup failed", {
				organizationId,
				...describePolarError(error),
			});
			return [];
		},
	);

	const [subscription] = subscriptions;
	if (!subscription) return false;

	const activated = (await projectSubscription(subscription)) === "active";
	if (activated)
		billingLogger.info("Activated from Polar after a missed webhook", {
			organizationId,
			subscriptionId: subscription.id,
		});
	return activated;
};
