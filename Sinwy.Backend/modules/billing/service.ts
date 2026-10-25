import type { Membership } from "@authModule";
import {
	describePolarError,
	PolarApiErrors,
	type PolarFailure,
	type PolarModels,
	polarClient,
	polarFailureOf,
	productIdFor,
} from "@backend/infrastructure/polar";
import { createLogger } from "@logger";
import {
	getSubscriptionState,
	isSuspended,
	type SubscriptionState,
} from "@organizationsModule";
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
	isEntitled,
	listBillableSubscriptions,
	projectSubscription,
	reconcileInactiveOrganization,
} from "./projection";

type Subscription = PolarModels.Subscription;

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
		.get(checkoutId)
		.catch(() => null);
	if (!checkout || checkout.external_customer_id !== userId) return null;
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
		subscription.recurring_interval,
		"subscription.recurring_interval",
	);
	if (!subscriptionStatus || !interval) return null;
	return {
		subscriptionStatus,
		amount: subscription.amount,
		currency: subscription.currency,
		interval,
		intervalCount: subscription.recurring_interval_count,
		currentPeriodEnd: subscription.current_period_end,
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
		endsAt: subscription.ends_at,
		pauseAtPeriodEnd: subscription.pause_at_period_end,
		resumesAt: subscription.resumes_at,
	};
};

const toSubscriptionDto = (
	state: SubscriptionState,
	subscription: Subscription | null,
): OrganizationSubscriptionDto => ({
	status: state.status,
	suspended: isSuspended(state),
	plan: state.plan,
	features: featuresFor(state.plan),
	billing: subscription && toBillingDto(subscription),
});

/** A Polar outage only costs the billing details, never the projection. */
const fetchSubscription = (subscriptionId: string) =>
	polarClient.subscriptions.get(subscriptionId).catch((error: unknown) => {
		billingLogger.warn("Polar subscription read failed", {
			subscriptionId,
			...describePolarError(error),
		});
		return null;
	});

/** null when the organization was deleted after its membership resolved. */
export const getOrganizationSubscription = async (
	membership: Membership,
): Promise<OrganizationSubscriptionDto | null> => {
	const { organizationId } = membership;
	if (membership.status !== "active")
		await reconcileInactiveOrganization(organizationId);

	const state = await getSubscriptionState(organizationId);
	if (!state) return null;
	const subscription = state.subscriptionId
		? await fetchSubscription(state.subscriptionId)
		: null;
	// heals a missed webhook, e.g. a revocation, which reconcile never applies
	if (!subscription || !(await projectSubscription(subscription)))
		return toSubscriptionDto(state, subscription);
	const projected = await getSubscriptionState(organizationId);
	return projected && toSubscriptionDto(projected, subscription);
};

type ChangePlanResult =
	| { ok: true; data: OrganizationSubscriptionDto }
	| {
			ok: false;
			error:
				| "not-found"
				| "inactive"
				| "suspended"
				| "pause-pending"
				| "same-plan"
				| "canceled"
				| "locked"
				| PolarFailure;
	  };

type SubscriptionRead =
	| { ok: true; subscription: Subscription }
	| { ok: false; error: PolarFailure };

const readSubscription = async (
	organizationId: string,
	subscriptionId: string,
): Promise<SubscriptionRead> => {
	try {
		return {
			ok: true,
			subscription: await polarClient.subscriptions.get(subscriptionId),
		};
	} catch (error) {
		return {
			ok: false,
			error: toPolarFailure(error, "Polar subscription read failed", {
				organizationId,
				subscriptionId,
			}),
		};
	}
};

const isLocked = (error: unknown) =>
	error instanceof PolarApiErrors.SubscriptionsUpdate409Error &&
	error.error.error === "SubscriptionLocked";

/**
 * Paid → paid plan change on the existing subscription. A checkout would
 * start a second subscription instead. "prorate" switches the plan now and
 * settles the difference on the next regular invoice.
 */
export const changeOrganizationPlan = async (
	membership: Membership,
	plan: PlanSlug,
): Promise<ChangePlanResult> => {
	const state = await getSubscriptionState(membership.organizationId);
	if (!state) return { ok: false, error: "not-found" };
	if (isSuspended(state)) return { ok: false, error: "suspended" };
	if (!state.subscriptionId) return { ok: false, error: "inactive" };
	if (state.plan === plan) return { ok: false, error: "same-plan" };

	// Polar would switch the plan of a subscription about to pause
	const current = await readSubscription(
		membership.organizationId,
		state.subscriptionId,
	);
	if (!current.ok) return current;
	if (current.subscription.pause_at_period_end)
		return { ok: false, error: "pause-pending" };

	const productId = productIdFor(plan);
	let subscription: Subscription;
	try {
		subscription = await polarClient.subscriptions.update(
			state.subscriptionId,
			{ product_id: productId, proration_behavior: "prorate" },
		);
	} catch (error) {
		if (
			error instanceof PolarApiErrors.SubscriptionsUpdate403Error &&
			error.error.error === "AlreadyCanceledSubscription"
		)
			return { ok: false, error: "canceled" };
		if (isLocked(error)) return { ok: false, error: "locked" };
		// a double submit, or a retry after our projection failed, finds Polar
		// already on the product
		const current =
			polarFailureOf(error) === "rejected"
				? await fetchSubscription(state.subscriptionId)
				: null;
		if (current?.product_id !== productId)
			return {
				ok: false,
				error: toPolarFailure(error, "Polar plan change failed", {
					organizationId: membership.organizationId,
					plan,
				}),
			};
		subscription = current;
	}

	// the subscription.updated webhook lands the same state; applying it now
	// saves the caller from polling
	await projectSubscription(subscription);
	const updated = await getSubscriptionState(membership.organizationId);
	if (!updated) return { ok: false, error: "not-found" };
	return { ok: true, data: toSubscriptionDto(updated, subscription) };
};

export type SubscriptionActionError =
	| "not-found"
	| "inactive"
	| "suspended"
	| "not-suspended"
	| "trialing"
	| "past-due"
	| "pause-pending"
	| "pause-not-pending"
	| "cancel-pending"
	| "locked"
	| "payment-failed"
	| PolarFailure;

type SubscriptionActionResult =
	| { ok: true; data: OrganizationSubscriptionDto }
	| { ok: false; error: SubscriptionActionError };

type SubscriptionAction = {
	name: string;
	body: PolarModels.SubscriptionUpdate;
	/** Why Polar's current state rules the action out, or null when it doesn't. */
	refuse: (subscription: Subscription) => SubscriptionActionError | null;
};

// ended, or a status no action applies to
const refuseUnlessLive = (subscription: Subscription) =>
	subscription.status === "paused"
		? "suspended"
		: isEntitled(subscription)
			? null
			: "inactive";

const SUSPEND: SubscriptionAction = {
	name: "suspend",
	body: { pause_at_period_end: true },
	refuse: (subscription) => {
		const unlive = refuseUnlessLive(subscription);
		if (unlive) return unlive;
		// Polar pauses only an active subscription
		if (subscription.status === "trialing") return "trialing";
		if (subscription.status === "past_due") return "past-due";
		if (subscription.pause_at_period_end) return "pause-pending";
		if (subscription.cancel_at_period_end) return "cancel-pending";
		return null;
	},
};

const UNSUSPEND: SubscriptionAction = {
	name: "unsuspend",
	body: { pause_at_period_end: false },
	refuse: (subscription) =>
		refuseUnlessLive(subscription) ??
		(subscription.pause_at_period_end ? null : "pause-not-pending"),
};

const RESUME: SubscriptionAction = {
	name: "resume",
	body: { resume: true },
	refuse: (subscription) =>
		subscription.status === "paused"
			? null
			: isEntitled(subscription)
				? "not-suspended"
				: "inactive",
};

/**
 * Runs a pause or resume update on the organization's bound subscription.
 * Polar's current state is projected first, so a missed webhook neither
 * decides the refusal nor lingers, and each refusal says why. When Polar
 * refuses anyway (a concurrent change), its new state explains the refusal.
 */
const runSubscriptionAction = async (
	membership: Membership,
	action: SubscriptionAction,
): Promise<SubscriptionActionResult> => {
	const { organizationId } = membership;
	const state = await getSubscriptionState(organizationId);
	if (!state) return { ok: false, error: "not-found" };
	if (!state.subscriptionId) return { ok: false, error: "inactive" };

	const read = await readSubscription(organizationId, state.subscriptionId);
	if (!read.ok) return read;
	await projectSubscription(read.subscription);
	const refused = action.refuse(read.subscription);
	if (refused) return { ok: false, error: refused };

	let subscription: Subscription;
	try {
		subscription = await polarClient.subscriptions.update(
			read.subscription.id,
			action.body,
		);
	} catch (error) {
		const current =
			polarFailureOf(error) === "rejected"
				? await fetchSubscription(read.subscription.id)
				: null;
		if (current) await projectSubscription(current);
		// a resume whose charge failed leaves the subscription past_due, which
		// keeps access while Polar retries; the caller reads that off billing
		const resumedUnpaid =
			error instanceof PolarApiErrors.SubscriptionsUpdate402Error &&
			current !== null &&
			isEntitled(current);
		if (!resumedUnpaid) {
			const reason = current && action.refuse(current);
			if (reason) return { ok: false, error: reason };
			if (isLocked(error)) return { ok: false, error: "locked" };
			if (error instanceof PolarApiErrors.SubscriptionsUpdate402Error)
				return { ok: false, error: "payment-failed" };
			return {
				ok: false,
				error: toPolarFailure(error, `Polar ${action.name} failed`, {
					organizationId,
				}),
			};
		}
		subscription = current;
	}

	await projectSubscription(subscription);
	const updated = await getSubscriptionState(organizationId);
	if (!updated) return { ok: false, error: "not-found" };
	billingLogger.info(`Subscription ${action.name} applied`, {
		organizationId,
		subscriptionId: subscription.id,
		subscriptionStatus: subscription.status,
	});
	return { ok: true, data: toSubscriptionDto(updated, subscription) };
};

/** Pauses at the end of the paid period; the organization stays active until then. No refund. */
export const suspendOrganization = (membership: Membership) =>
	runSubscriptionAction(membership, SUSPEND);

/** Takes back a pause that hasn't taken effect yet. */
export const unsuspendOrganization = (membership: Membership) =>
	runSubscriptionAction(membership, UNSUSPEND);

/** Resumes a paused subscription: Polar starts a new period and charges for it now. */
export const resumeOrganization = (membership: Membership) =>
	runSubscriptionAction(membership, RESUME);

/**
 * Idempotent: no billable subscription → no-op. Revokes every one, since a
 * raced second checkout can leave two: past_due included since Polar still
 * retries its charge, paused since resuming would charge again. Throws so a
 * paying subscription is never orphaned.
 */
export const revokeOrganizationSubscription = async (
	organizationId: string,
) => {
	try {
		// collected first: revoking while paging would shift later pages
		const subscriptions = await listBillableSubscriptions(organizationId);
		for (const { id: subscriptionId } of subscriptions) {
			await polarClient.subscriptions.revoke(subscriptionId);
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
