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
	getOrganizationState,
	slotLimit,
	slotsOverLimit,
} from "@organizationsModule";
import {
	type AccountSubscriptionDto,
	BILLING_INTERVALS,
	isUpgrade,
	type OrganizationStatus,
	type PendingPlanChangeDto,
	PLAN_ORGANIZATION_LIMITS,
	type PlanEndBlocker,
	type PlanSlug,
	SUBSCRIPTION_BILLING_STATUSES,
	type SubscriptionBillingDto,
	toPlanSlug,
} from "@sinwy/shared";
import { APIError } from "better-auth/api";
import { knownValue, toPolarFailure } from "./polar";
import {
	isEntitled,
	listBillableSubscriptions,
	pendingPlanOf,
	projectSubscription,
	reconcileUserPlan,
} from "./projection";
import {
	clearDowngrade,
	findUserSubscription,
	listOwnedHeldSlots,
	saveDowngrade,
} from "./repository";

type Subscription = PolarModels.Subscription;

const billingLogger = createLogger("billing");

/**
 * An organization that holds a slot but whose owner's plan looks lapsed asks
 * Polar first, in case a webhook never landed.
 */
export const getOrganizationStatus = async (
	membership: Membership,
): Promise<OrganizationStatus> => {
	if (membership.status === "active") return "active";
	const state = await getOrganizationState(membership.organizationId);
	if (!state?.slotHeld || state.ownerPlan || !state.ownerUserId)
		return state?.status ?? "inactive";
	await reconcileUserPlan(state.ownerUserId);
	return (
		(await getOrganizationState(membership.organizationId))?.status ??
		"inactive"
	);
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

export type PlanState = {
	plan: PlanSlug | null;
	subscriptionId: string | null;
	/** Paused, still bound: it resumes without a new checkout. */
	suspended: boolean;
	/** The downgrade scheduled in the app, and the organizations it deactivates. */
	downgrade: { plan: PlanSlug; releases: string[] } | null;
};

/** The user's stored plan; no row reads as no plan. */
const getPlanState = async (userId: string): Promise<PlanState> => {
	const row = await findUserSubscription(userId);
	const downgradePlan = toPlanSlug(row?.downgradePlan ?? null);
	return {
		plan: toPlanSlug(row?.plan ?? null),
		subscriptionId: row?.subscriptionId ?? null,
		suspended: row?.status === "paused" && row.subscriptionId !== null,
		downgrade: downgradePlan
			? { plan: downgradePlan, releases: row?.downgradeReleases ?? [] }
			: null,
	};
};

/** What the plan change Polar holds does to the user's slots once it applies. */
const toPendingChangeDto = async (
	userId: string,
	state: PlanState,
	subscription: Subscription,
): Promise<PendingPlanChangeDto | null> => {
	const plan = pendingPlanOf(subscription);
	if (!plan || !subscription.pending_update) return null;
	const releases =
		state.downgrade?.plan === plan ? state.downgrade.releases : [];
	const { picked, unpicked } = slotsOverLimit(
		await listOwnedHeldSlots(userId),
		slotLimit(plan),
		releases,
	);
	return {
		plan,
		appliesAt: subscription.pending_update.applies_at,
		deactivates: [...picked, ...unpicked],
	};
};

const toSubscriptionDto = async (
	userId: string,
	state: PlanState,
	subscription: Subscription | null,
): Promise<AccountSubscriptionDto> => ({
	plan: state.plan,
	suspended: state.suspended,
	organizationLimit: state.plan ? PLAN_ORGANIZATION_LIMITS[state.plan] : 0,
	activeOrganizations: await listOwnedHeldSlots(userId),
	billing: subscription && toBillingDto(subscription),
	pendingChange:
		subscription && (await toPendingChangeDto(userId, state, subscription)),
	blockers: {
		suspend: planEndBlocker(state, subscription, SUSPEND),
		cancel: planEndBlocker(state, subscription, CANCEL),
	},
});

/** What the action's own refusal would say now, so the page and the route agree. */
const planEndBlocker = (
	state: PlanState,
	subscription: Subscription | null,
	action: SubscriptionAction<PlanEndBlocker>,
) => {
	if (!state.subscriptionId) return "inactive";
	return subscription ? action.refuse(subscription) : "unavailable";
};

/** A Polar outage only costs the billing details, never the projection. */
const fetchSubscription = (subscriptionId: string) =>
	polarClient.subscriptions.get(subscriptionId).catch((error: unknown) => {
		billingLogger.warn("Polar subscription read failed", {
			subscriptionId,
			...describePolarError(error),
		});
		return null;
	});

export const getAccountSubscription = async (
	userId: string,
): Promise<AccountSubscriptionDto> => {
	await reconcileUserPlan(userId);
	const state = await getPlanState(userId);
	const subscription = state.subscriptionId
		? await fetchSubscription(state.subscriptionId)
		: null;
	// heals a missed webhook, e.g. a revocation, which reconcile never applies
	if (!subscription || !(await projectSubscription(subscription)))
		return toSubscriptionDto(userId, state, subscription);
	return toSubscriptionDto(userId, await getPlanState(userId), subscription);
};

type ChangePlanResult =
	| { ok: true; data: AccountSubscriptionDto }
	| {
			ok: false;
			error:
				| "inactive"
				| "suspended"
				| "pause-pending"
				| "cancel-pending"
				| "same-plan"
				| "picks-required"
				| "invalid-picks"
				| "canceled"
				| "locked"
				| PolarFailure;
	  };

type SubscriptionRead =
	| { ok: true; subscription: Subscription }
	| { ok: false; error: PolarFailure };

const readSubscription = async (
	userId: string,
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
				userId,
				subscriptionId,
			}),
		};
	}
};

const isLocked = (error: unknown) =>
	error instanceof PolarApiErrors.SubscriptionsUpdate409Error &&
	error.error.error === "SubscriptionLocked";

type Releases =
	| { ok: true; releases: string[] }
	| { ok: false; error: "picks-required" | "invalid-picks" };

/**
 * The active organizations a downgrade to `plan` deactivates: those the user
 * didn't keep. Picks are needed only when more are active than the plan
 * allows (D6).
 */
const downgradeReleases = async (
	userId: string,
	plan: PlanSlug,
	keep: string[] | undefined,
): Promise<Releases> => {
	const held = (await listOwnedHeldSlots(userId)).map(({ id }) => id);
	const limit = slotLimit(plan);
	if (!keep)
		return held.length > limit
			? { ok: false, error: "picks-required" }
			: { ok: true, releases: [] };
	const kept = new Set(keep);
	if (
		kept.size !== keep.length ||
		kept.size > limit ||
		keep.some((id) => !held.includes(id))
	)
		return { ok: false, error: "invalid-picks" };
	return { ok: true, releases: held.filter((id) => !kept.has(id)) };
};

type PlanUpdate = {
	body: PolarModels.SubscriptionUpdate;
	/** Polar's subscription already carries the change, e.g. after a double submit. */
	carries: (subscription: Subscription) => boolean;
};

/**
 * Paid → paid plan change on the existing subscription. A checkout would
 * start a second subscription instead. An upgrade switches now, "prorate"
 * settling the difference on the next regular invoice (Default 7). A
 * downgrade waits for the period end, "next_period", and takes the slots of
 * the organizations the user didn't keep then (D6). Any later update,
 * an upgrade included, discards a pending one in Polar.
 */
export const changeAccountPlan = async (
	userId: string,
	plan: PlanSlug,
	keep?: string[],
): Promise<ChangePlanResult> => {
	const state = await getPlanState(userId);
	if (state.suspended) return { ok: false, error: "suspended" };
	if (!state.subscriptionId || !state.plan)
		return { ok: false, error: "inactive" };
	if (state.plan === plan) return { ok: false, error: "same-plan" };

	// Polar would switch the plan of a subscription about to pause
	const current = await readSubscription(userId, state.subscriptionId);
	if (!current.ok) return current;
	if (current.subscription.pause_at_period_end)
		return { ok: false, error: "pause-pending" };
	if (current.subscription.cancel_at_period_end)
		return { ok: false, error: "cancel-pending" };

	const productId = productIdFor(plan);
	const downgrade = isUpgrade(plan, state.plan);
	let releases: string[] = [];
	if (downgrade) {
		const picks = await downgradeReleases(userId, plan, keep);
		if (!picks.ok) return picks;
		releases = picks.releases;
	}
	const update: PlanUpdate = downgrade
		? {
				body: { product_id: productId, proration_behavior: "next_period" },
				carries: (subscription) =>
					subscription.pending_update?.product_id === productId,
			}
		: {
				body: { product_id: productId, proration_behavior: "prorate" },
				carries: (subscription) => subscription.product_id === productId,
			};

	let subscription: Subscription;
	try {
		subscription = await polarClient.subscriptions.update(
			state.subscriptionId,
			update.body,
		);
	} catch (error) {
		if (
			error instanceof PolarApiErrors.SubscriptionsUpdate403Error &&
			error.error.error === "AlreadyCanceledSubscription"
		)
			return { ok: false, error: "canceled" };
		if (isLocked(error)) return { ok: false, error: "locked" };
		// a double submit, or a retry after our projection failed, finds Polar
		// already carrying the change
		const current =
			polarFailureOf(error) === "rejected"
				? await fetchSubscription(state.subscriptionId)
				: null;
		if (!current || !update.carries(current))
			return {
				ok: false,
				error: toPolarFailure(error, "Polar plan change failed", {
					userId,
					plan,
				}),
			};
		subscription = current;
	}

	if (downgrade) await saveDowngrade(userId, plan, releases);
	// the subscription.updated webhook lands the same state; applying it now
	// saves the caller from polling
	await projectSubscription(subscription);
	return {
		ok: true,
		data: await toSubscriptionDto(
			userId,
			await getPlanState(userId),
			subscription,
		),
	};
};

type CancelPlanChangeResult =
	| { ok: true; data: AccountSubscriptionDto }
	| {
			ok: false;
			error: "inactive" | "not-pending" | "locked" | PolarFailure;
	  };

/** Takes back a downgrade before the period ends; the plan stays as it is. */
export const cancelPendingPlanChange = async (
	userId: string,
): Promise<CancelPlanChangeResult> => {
	const state = await getPlanState(userId);
	if (!state.subscriptionId) return { ok: false, error: "inactive" };

	const read = await readSubscription(userId, state.subscriptionId);
	if (!read.ok) return read;
	if (!read.subscription.pending_update) {
		await clearDowngrade(userId);
		await projectSubscription(read.subscription);
		return { ok: false, error: "not-pending" };
	}

	let subscription: Subscription;
	try {
		subscription = await polarClient.subscriptions.update(
			read.subscription.id,
			{ pending_update: null },
		);
	} catch (error) {
		if (isLocked(error)) return { ok: false, error: "locked" };
		const current =
			polarFailureOf(error) === "rejected"
				? await fetchSubscription(read.subscription.id)
				: null;
		if (!current || current.pending_update)
			return {
				ok: false,
				error: toPolarFailure(error, "Polar plan change cancel failed", {
					userId,
				}),
			};
		subscription = current;
	}

	await clearDowngrade(userId);
	await projectSubscription(subscription);
	return {
		ok: true,
		data: await toSubscriptionDto(
			userId,
			await getPlanState(userId),
			subscription,
		),
	};
};

export type SubscriptionActionError =
	| "inactive"
	| "suspended"
	| "not-suspended"
	| "trialing"
	| "past-due"
	| "pause-pending"
	| "pause-not-pending"
	| "cancel-pending"
	| "cancel-not-pending"
	| "plan-change-pending"
	| "locked"
	| "payment-failed"
	| PolarFailure;

type SubscriptionActionResult =
	| { ok: true; data: AccountSubscriptionDto }
	| { ok: false; error: SubscriptionActionError };

type SubscriptionAction<
	Refusal extends SubscriptionActionError = SubscriptionActionError,
> = {
	name: string;
	body: PolarModels.SubscriptionUpdate;
	/** Why Polar's current state rules the action out, or null when it doesn't. */
	refuse: (subscription: Subscription) => Refusal | null;
};

// ended, or a status no action applies to
const refuseUnlessLive = (subscription: Subscription): PlanEndBlocker | null =>
	subscription.status === "paused"
		? "suspended"
		: isEntitled(subscription)
			? null
			: "inactive";

const SUSPEND: SubscriptionAction<PlanEndBlocker> = {
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
		// any update makes Polar drop a scheduled plan change
		if (subscription.pending_update) return "plan-change-pending";
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

const CANCEL: SubscriptionAction<PlanEndBlocker> = {
	name: "cancel",
	body: { cancel_at_period_end: true },
	refuse: (subscription) => {
		const unlive = refuseUnlessLive(subscription);
		if (unlive) return unlive;
		if (subscription.pause_at_period_end) return "pause-pending";
		if (subscription.cancel_at_period_end) return "cancel-pending";
		if (subscription.pending_update) return "plan-change-pending";
		return null;
	},
};

const UNCANCEL: SubscriptionAction = {
	name: "uncancel",
	body: { cancel_at_period_end: false },
	refuse: (subscription) =>
		refuseUnlessLive(subscription) ??
		(subscription.cancel_at_period_end ? null : "cancel-not-pending"),
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
 * Runs a pause, cancel or resume update on the user's bound subscription.
 * Polar's current state is projected first, so a missed webhook neither
 * decides the refusal nor lingers, and each refusal says why. When Polar
 * refuses anyway (a concurrent change), its new state explains the refusal.
 */
const runSubscriptionAction = async (
	userId: string,
	action: SubscriptionAction,
): Promise<SubscriptionActionResult> => {
	const state = await getPlanState(userId);
	if (!state.subscriptionId) return { ok: false, error: "inactive" };

	const read = await readSubscription(userId, state.subscriptionId);
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
					userId,
				}),
			};
		}
		subscription = current;
	}

	await projectSubscription(subscription);
	billingLogger.info(`Subscription ${action.name} applied`, {
		userId,
		subscriptionId: subscription.id,
		subscriptionStatus: subscription.status,
	});
	return {
		ok: true,
		data: await toSubscriptionDto(
			userId,
			await getPlanState(userId),
			subscription,
		),
	};
};

/** Pauses at the end of the paid period; the user's organizations stay active until then. No refund. */
export const suspendAccountPlan = (userId: string) =>
	runSubscriptionAction(userId, SUSPEND);

/** Takes back a pause that hasn't taken effect yet. */
export const unsuspendAccountPlan = (userId: string) =>
	runSubscriptionAction(userId, UNSUSPEND);

/** Ends the plan at the end of the paid period; the user's organizations stay active until then. No refund. */
export const cancelAccountPlan = (userId: string) =>
	runSubscriptionAction(userId, CANCEL);

/** Takes back a cancellation that hasn't taken effect yet. */
export const uncancelAccountPlan = (userId: string) =>
	runSubscriptionAction(userId, UNCANCEL);

/** Resumes a paused subscription: Polar starts a new period and charges for it now. */
export const resumeAccountPlan = (userId: string) =>
	runSubscriptionAction(userId, RESUME);

/**
 * Idempotent: no billable subscription → no-op. Revokes every one, since a
 * raced second checkout can leave two: past_due included since Polar still
 * retries its charge, paused since resuming would charge again. Throws so a
 * paying subscription is never orphaned.
 */
export const revokeAccountSubscriptions = async (userId: string) => {
	try {
		// collected first: revoking while paging would shift later pages
		const subscriptions = await listBillableSubscriptions(userId);
		for (const { id: subscriptionId } of subscriptions) {
			await polarClient.subscriptions.revoke(subscriptionId);
			billingLogger.info("Revoked subscription before account deletion", {
				userId,
				subscriptionId,
			});
		}
	} catch (error) {
		billingLogger.error("Polar subscription revoke failed", {
			userId,
			...describePolarError(error),
		});
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Could not cancel your subscription. Try again later.",
		});
	}
};
