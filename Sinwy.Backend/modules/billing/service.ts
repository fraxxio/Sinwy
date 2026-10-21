import type { Membership } from "@authModule";
import { polarClient, productIdFor } from "@backend/infrastructure/polar";
import { createLogger } from "@logger";
import {
	getSubscriptionState,
	type SubscriptionState,
} from "@organizationsModule";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import { AlreadyCanceledSubscription } from "@polar-sh/sdk/models/errors/alreadycanceledsubscription";
import { SubscriptionLocked } from "@polar-sh/sdk/models/errors/subscriptionlocked";
import {
	featuresFor,
	type OrganizationStatus,
	type OrganizationSubscriptionDto,
	type PlanSlug,
	type SubscriptionBillingDto,
} from "@sinwy/shared";
import { APIError } from "better-auth/api";
import {
	projectSubscription,
	reconcileInactiveOrganization,
} from "./projection";

const billingLogger = createLogger("billing");

export const getOrganizationStatus = async (
	membership: Membership,
): Promise<OrganizationStatus> =>
	membership.status === "active" ||
	(await reconcileInactiveOrganization(membership.organizationId))
		? "active"
		: "inactive";

export const getCheckoutOrganization = async (
	userId: string,
	checkoutId: string,
) => {
	// null → unknown checkout, someone else's checkout, or no org reference
	const checkout = await polarClient.checkouts
		.get({ id: checkoutId })
		.catch(() => null);
	if (!checkout || checkout.externalCustomerId !== userId) return null;
	const referenceId = checkout.metadata["referenceId"];
	return typeof referenceId === "string"
		? { organizationId: referenceId }
		: null;
};

const toBillingDto = (subscription: Subscription): SubscriptionBillingDto => ({
	subscriptionStatus:
		subscription.status as SubscriptionBillingDto["subscriptionStatus"],
	amount: subscription.amount,
	currency: subscription.currency,
	interval:
		subscription.recurringInterval as SubscriptionBillingDto["interval"],
	currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
	cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
	endsAt: subscription.endsAt?.toISOString() ?? null,
});

const toSubscriptionDto = (
	state: SubscriptionState,
	subscription: Subscription | null,
): OrganizationSubscriptionDto => ({
	status: state.status,
	plan: state.plan,
	features: featuresFor(state.plan),
	billing: subscription && toBillingDto(subscription),
});

/** A Polar outage only costs the billing details, never the projection. */
const fetchSubscription = (subscriptionId: string) =>
	polarClient.subscriptions
		.get({ id: subscriptionId })
		.catch((error: unknown) => {
			billingLogger.warn("Polar subscription read failed", {
				subscriptionId,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		});

const requireSubscriptionState = async (organizationId: string) => {
	const state = await getSubscriptionState(organizationId);
	// the membership was just resolved, so the org exists unless deleted mid-request
	if (!state) throw new Error(`Organization ${organizationId} vanished`);
	return state;
};

export const getOrganizationSubscription = async (
	membership: Membership,
): Promise<OrganizationSubscriptionDto> => {
	const { organizationId } = membership;
	if (membership.status !== "active")
		await reconcileInactiveOrganization(organizationId);

	const state = await requireSubscriptionState(organizationId);
	const subscription = state.subscriptionId
		? await fetchSubscription(state.subscriptionId)
		: null;
	return toSubscriptionDto(state, subscription);
};

type ChangePlanResult =
	| { ok: true; data: OrganizationSubscriptionDto }
	| { ok: false; error: "inactive" | "same-plan" | "canceled" | "locked" };

/**
 * Paid → paid plan change on the existing subscription. A checkout would
 * start a second subscription instead. "prorate" switches the plan now and
 * settles the difference on the next regular invoice.
 */
export const changeOrganizationPlan = async (
	membership: Membership,
	plan: PlanSlug,
): Promise<ChangePlanResult> => {
	const state = await requireSubscriptionState(membership.organizationId);
	if (!state.subscriptionId) return { ok: false, error: "inactive" };
	if (state.plan === plan) return { ok: false, error: "same-plan" };

	const requestedAt = new Date();
	let subscription: Subscription;
	try {
		subscription = await polarClient.subscriptions.update({
			id: state.subscriptionId,
			subscriptionUpdate: {
				productId: productIdFor(plan),
				prorationBehavior: "prorate",
			},
		});
	} catch (error) {
		if (error instanceof AlreadyCanceledSubscription)
			return { ok: false, error: "canceled" };
		if (error instanceof SubscriptionLocked)
			return { ok: false, error: "locked" };
		throw error;
	}

	// the subscription.updated webhook lands the same state; applying it now
	// saves the caller from polling
	await projectSubscription(subscription, requestedAt);
	const updated = await requireSubscriptionState(membership.organizationId);
	return { ok: true, data: toSubscriptionDto(updated, subscription) };
};

/** Idempotent: no active subscription → no-op. Throws so a paying subscription is never orphaned. */
export const revokeOrganizationSubscription = async (
	organizationId: string,
) => {
	try {
		const subscriptions = await polarClient.subscriptions.list({
			metadata: { referenceId: organizationId },
			active: true,
			limit: 1,
		});
		const subscription = subscriptions.result.items[0];
		if (!subscription) return;
		await polarClient.subscriptions.revoke({ id: subscription.id });
		billingLogger.info("Revoked subscription before deletion", {
			organizationId,
			subscriptionId: subscription.id,
		});
	} catch (error) {
		billingLogger.error("Polar subscription revoke failed", {
			organizationId,
			error: error instanceof Error ? error.message : String(error),
		});
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message:
				"Could not cancel an organization subscription. Try again later.",
		});
	}
};
