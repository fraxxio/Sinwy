import { clearActiveOrganization } from "@authModule";
import { emailClient } from "@backend/infrastructure/email";
import {
	describePolarError,
	type PolarModels,
	planFor,
	polarClient,
} from "@backend/infrastructure/polar";
import appConfig from "@config";
import { createLogger } from "@logger";
import { listOwnedOrganizationIds } from "@organizationsModule";
import { ENTITLED_SUBSCRIPTION_STATUSES } from "@sinwy/shared";
import { OrganizationsDeactivatedEmail } from "./emails/planEmails";
import { refundInFull } from "./refunds";
import {
	findUserContact,
	findUserSubscription,
	type SlotsReleased,
	writeUserSubscription,
} from "./repository";

type Subscription = PolarModels.Subscription;

const billingLogger = createLogger("billing:projection");

const SECOND_PLAN_COMMENT = "A second plan for an account that already has one";

export const isEntitled = (subscription: Subscription) =>
	(ENTITLED_SUBSCRIPTION_STATUSES as readonly string[]).includes(
		subscription.status,
	);

/** Grants access now, or could charge later: a paused one resumes with a charge. */
export const isBillable = (subscription: Subscription) =>
	isEntitled(subscription) || subscription.status === "paused";

export const planOf = (subscription: Subscription) => {
	const plan = planFor(subscription.product_id);
	if (!plan)
		billingLogger.error("Subscription product maps to no plan", {
			subscriptionId: subscription.id,
			productId: subscription.product_id,
		});
	return plan;
};

export type PlanProjection = "entitled" | "not-entitled";

/** Takes every organization the user owns out of the sessions that have it open. */
const closeOwnedOrganizations = async (userId: string) => {
	for (const organizationId of await listOwnedOrganizationIds(userId))
		await clearActiveOrganization(organizationId);
};

/**
 * Two checkouts raced past the guard (e.g. two tabs). The user keeps the plan
 * already bound; the other is revoked and refunded in full. Throws when Polar
 * refuses the revoke, so the webhook is retried.
 */
const revokeSecondPlan = async (subscription: Subscription, userId: string) => {
	const context = { userId, subscriptionId: subscription.id };
	billingLogger.warn("Revoking a second plan for the same user", context);
	try {
		await polarClient.subscriptions.revoke(subscription.id);
	} catch (error) {
		billingLogger.error("Revoke failed; revoke it in Polar", {
			...context,
			...describePolarError(error),
		});
		throw error;
	}
	await refundInFull(subscription.id, SECOND_PLAN_COMMENT);
};

/** The plan Polar switches to when the period ends; null without one. */
export const pendingPlanOf = (subscription: Subscription) => {
	const productId = subscription.pending_update?.product_id;
	return productId ? planFor(productId) : null;
};

const write = (subscription: Subscription, userId: string, observedAt: Date) =>
	writeUserSubscription(userId, subscription.id, observedAt, {
		plan: isEntitled(subscription) ? planOf(subscription) : null,
		pendingPlan: pendingPlanOf(subscription),
		status: subscription.status,
		bound: isBillable(subscription),
	});

/**
 * Organizations that lost their slot leave the sessions that have them open.
 * The owner hears about the ones their own picks didn't name (Default 9).
 * Failures are logged: the slots are already settled.
 */
const announceReleasedSlots = async (
	userId: string,
	{ picked, unpicked, limit }: SlotsReleased,
) => {
	const context = { userId, picked: picked.length, unpicked: unpicked.length };
	if (picked.length + unpicked.length === 0) return;
	billingLogger.info("Organizations lost their slot to a lower cap", context);
	try {
		for (const { id } of [...picked, ...unpicked])
			await clearActiveOrganization(id);
		const contact = unpicked.length > 0 && (await findUserContact(userId));
		if (!contact) return;
		await emailClient.send({
			to: contact.email,
			template: OrganizationsDeactivatedEmail,
			props: {
				organizationNames: unpicked.map(({ name }) => name),
				organizationLimit: limit,
				manageUrl: new URL(
					"/account/organizations",
					appConfig.WEB_APP_URL,
				).toString(),
			},
		});
	} catch (error) {
		billingLogger.error("Announcing released slots failed", {
			...context,
			error,
		});
	}
};

/**
 * Projects a Polar subscription onto its user, found by the customer's
 * `external_id`. A paused subscription stays bound, so it can resume; only an
 * ended one releases it. State is derived from the subscription object only,
 * so re-delivery and overlapping events converge on the same result, and it
 * is ordered by Polar's own modification time whichever path (webhook,
 * reconcile, plan change) delivers it. Returns what was applied, or null when
 * the user was left as is.
 */
export const projectSubscription = async (
	subscription: Subscription,
): Promise<PlanProjection | null> => {
	const userId = subscription.customer.external_id;
	if (!userId) {
		billingLogger.warn("Subscription's customer has no external id", {
			subscriptionId: subscription.id,
		});
		return null;
	}
	const observedAt = new Date(
		subscription.modified_at ?? subscription.created_at,
	);
	const context = {
		userId,
		subscriptionId: subscription.id,
		subscriptionStatus: subscription.status,
	};

	let written = await write(subscription, userId, observedAt);
	if (written.result === "bound-elsewhere" && isBillable(subscription)) {
		// the bound one may have ended without its webhook landing
		const bound = await polarClient.subscriptions.get(
			written.boundSubscriptionId,
		);
		if (isBillable(bound)) {
			await revokeSecondPlan(subscription, userId);
			return null;
		}
		await projectSubscription(bound);
		written = await write(subscription, userId, observedAt);
	}

	switch (written.result) {
		case "applied":
			billingLogger.info("Plan projected from subscription", context);
			await announceReleasedSlots(userId, written);
			if (isEntitled(subscription)) return "entitled";
			await closeOwnedOrganizations(userId);
			return "not-entitled";
		case "unknown-user":
			// a deleted user's Polar customer is deleted too, which cancels its subscriptions
			billingLogger.warn("Subscription for an unknown user", context);
			return null;
		case "outdated":
			// routine: redeliveries, and every billing page load re-projects
			billingLogger.debug(
				"Ignored subscription state not newer than the applied one",
				{ ...context, observedAt: observedAt.toISOString() },
			);
			return null;
		case "bound-elsewhere":
			billingLogger.warn("Ignored a subscription the user no longer uses", {
				...context,
				boundSubscriptionId: written.boundSubscriptionId,
			});
			return null;
	}
};

/** Webhook entry point. Late retries and reordered events lose to the newer state. */
export const applySubscriptionEvent = async (event: { data: Subscription }) => {
	await projectSubscription(event.data);
};

const listSubscriptions = async (
	userId: string,
	keep: (subscription: Subscription) => boolean,
) => {
	const kept: Subscription[] = [];
	const subscriptions = polarClient.subscriptions.iterList({
		external_customer_id: userId,
		limit: 100,
	});
	for await (const subscription of subscriptions)
		if (keep(subscription)) kept.push(subscription);
	return kept;
};

/**
 * The user's subscriptions that still grant access, across pages. Polar's
 * `active` filter leaves out past_due, hence the filter here.
 */
export const listEntitledSubscriptions = (userId: string) =>
	listSubscriptions(userId, isEntitled);

/** The entitled ones plus paused ones, which charge again when they resume. */
export const listBillableSubscriptions = (userId: string) =>
	listSubscriptions(userId, isBillable);

/**
 * Backstop for a webhook that never landed: a user without an entitled plan
 * asks Polar for one and takes it on positive evidence only, so a paused
 * subscription never counts. Never takes a plan away, since a failed lookup
 * must not lock out a paying user. Returns whether the user has a plan that
 * grants access.
 */
export const reconcileUserPlan = async (userId: string) => {
	if ((await findUserSubscription(userId))?.plan) return true;
	const subscriptions = await listEntitledSubscriptions(userId).catch(
		(error: unknown) => {
			billingLogger.warn("Polar subscription lookup failed", {
				userId,
				...describePolarError(error),
			});
			return [];
		},
	);

	const [subscription] = subscriptions;
	if (!subscription) return false;

	if ((await projectSubscription(subscription)) === "entitled")
		billingLogger.info("Plan taken from Polar after a missed webhook", {
			userId,
			subscriptionId: subscription.id,
		});
	return Boolean((await findUserSubscription(userId))?.plan);
};
