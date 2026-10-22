import type { Membership } from "@authModule";
import {
	describePolarError,
	type PolarFailure,
	polarClient,
	productIdFor,
} from "@backend/infrastructure/polar";
import { createLogger } from "@logger";
import {
	getSubscriptionState,
	type SubscriptionState,
} from "@organizationsModule";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import { AlreadyCanceledSubscription } from "@polar-sh/sdk/models/errors/alreadycanceledsubscription";
import { SubscriptionLocked } from "@polar-sh/sdk/models/errors/subscriptionlocked";
import {
	BILLING_INTERVALS,
	featuresFor,
	type OrganizationStatus,
	type OrganizationSubscriptionDto,
	type PlanSlug,
	SUBSCRIPTION_BILLING_STATUSES,
	type SubscriptionBillingDto,
} from "@sinwy/shared";
import { APIError } from "better-auth/api";
import { knownValue, toPolarFailure } from "./polar";
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

/** null when Polar sent a status or interval this version can't describe. */
const toBillingDto = (
	subscription: Subscription,
): SubscriptionBillingDto | null => {
	const subscriptionStatus = knownValue(
		SUBSCRIPTION_BILLING_STATUSES,
		subscription.status,
		"subscription.status",
	);
	const interval = knownValue(
		BILLING_INTERVALS,
		subscription.recurringInterval,
		"subscription.recurringInterval",
	);
	if (!subscriptionStatus || !interval) return null;
	return {
		subscriptionStatus,
		amount: subscription.amount,
		currency: subscription.currency,
		interval,
		intervalCount: subscription.recurringIntervalCount,
		currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
		cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
		endsAt: subscription.endsAt?.toISOString() ?? null,
	};
};

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
				...describePolarError(error),
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
	| {
			ok: false;
			error: "inactive" | "same-plan" | "canceled" | "locked" | PolarFailure;
	  };

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
		return {
			ok: false,
			error: toPolarFailure(error, "Polar plan change failed", {
				organizationId: membership.organizationId,
				plan,
			}),
		};
	}

	// the subscription.updated webhook lands the same state; applying it now
	// saves the caller from polling
	await projectSubscription(subscription);
	const updated = await requireSubscriptionState(membership.organizationId);
	return { ok: true, data: toSubscriptionDto(updated, subscription) };
};

const listActiveSubscriptionIds = async (organizationId: string) => {
	const ids: string[] = [];
	const pages = await polarClient.subscriptions.list({
		metadata: { referenceId: organizationId },
		active: true,
		limit: 100,
	});
	for await (const page of pages)
		ids.push(...page.result.items.map((subscription) => subscription.id));
	return ids;
};

/**
 * Idempotent: no active subscription → no-op. Revokes every one, since a
 * raced second checkout can leave two. Throws so a paying subscription is
 * never orphaned.
 */
export const revokeOrganizationSubscription = async (
	organizationId: string,
) => {
	try {
		// collected first: revoking while paging would shift later pages
		const subscriptionIds = await listActiveSubscriptionIds(organizationId);
		for (const subscriptionId of subscriptionIds) {
			await polarClient.subscriptions.revoke({ id: subscriptionId });
			billingLogger.info("Revoked subscription before deletion", {
				organizationId,
				subscriptionId,
			});
		}
	} catch (error) {
		billingLogger.error("Polar subscription revoke failed", {
			organizationId,
			...describePolarError(error),
		});
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message:
				"Could not cancel an organization subscription. Try again later.",
		});
	}
};
