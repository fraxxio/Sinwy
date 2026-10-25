import { clearActiveOrganization } from "@authModule";
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
	suspendSubscription,
} from "@organizationsModule";
import type { OrganizationStatus } from "@sinwy/shared";

type Subscription = PolarModels.Subscription;

const billingLogger = createLogger("billing:projection");

// past_due keeps access: Polar's dunning retries are the grace period
const ENTITLED_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

export const isEntitled = (subscription: Subscription) =>
	ENTITLED_STATUSES.includes(subscription.status);

/** Grants access now, or could charge later: a paused one resumes with a charge. */
const isBillable = (subscription: Subscription) =>
	isEntitled(subscription) || subscription.status === "paused";

const writeFor = (
	organizationId: string,
	subscription: Subscription,
	observedAt: Date,
) => {
	if (isEntitled(subscription))
		return activateSubscription(
			organizationId,
			subscription.id,
			planOf(subscription),
			observedAt,
		);
	if (subscription.status === "paused")
		return suspendSubscription(organizationId, subscription.id, observedAt);
	return deactivateSubscription(organizationId, subscription.id, observedAt);
};

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
 * `subscription_id`). A paused subscription stays bound to its inactive
 * organization; only an ended one releases it. State is derived from the subscription object only,
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

	const entitled = isEntitled(subscription);
	const write = await writeFor(organizationId, subscription, observedAt);

	const context = {
		organizationId,
		subscriptionId: subscription.id,
		subscriptionStatus: subscription.status,
	};
	switch (write.result) {
		case "applied":
			billingLogger.info("Organization projected from subscription", context);
			if (entitled) return "active";
			await clearActiveOrganization(organizationId);
			return "inactive";
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

const listSubscriptions = async (
	organizationId: string,
	keep: (subscription: Subscription) => boolean,
) => {
	const kept: Subscription[] = [];
	const subscriptions = polarClient.subscriptions.iterList({
		metadata: { referenceId: organizationId },
		limit: 100,
	});
	for await (const subscription of subscriptions)
		if (keep(subscription)) kept.push(subscription);
	return kept;
};

/**
 * Subscriptions of the organization that still grant access, across pages.
 * Polar's `active` filter leaves out past_due, hence the filter here.
 */
export const listEntitledSubscriptions = (organizationId: string) =>
	listSubscriptions(organizationId, isEntitled);

/** The entitled ones plus paused ones, which charge again when they resume. */
export const listBillableSubscriptions = (organizationId: string) =>
	listSubscriptions(organizationId, isBillable);

/**
 * Backstop for a webhook that never landed: an inactive organization asks
 * Polar for an entitled subscription and activates on positive evidence only,
 * so a paused subscription never activates it.
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
