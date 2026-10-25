import {
	describePolarError,
	type PolarFailure,
	type PolarModels,
	polarClient,
	productIdFor,
} from "@backend/infrastructure/polar";
import appConfig from "@config";
import { createLogger } from "@logger";
import { getSubscriptionState, isSuspended } from "@organizationsModule";
import type { PlanSlug } from "@sinwy/shared";
import {
	completeOrganizationTransfer,
	findTransferById,
	settleOrganizationTransfer,
} from "@transfersModule";
import { toPolarFailure } from "./polar";
import {
	isBillable,
	isEntitled,
	planOf,
	projectOwnSubscription,
} from "./projection";
import { planUnusedRefund, refundInFull, refundUnusedTime } from "./refunds";

type Subscription = PolarModels.Subscription;

const transferLogger = createLogger("billing:transfer");

const UNUSED_TIME_COMMENT = "Unused time after an ownership transfer";
const STRAY_COMMENT =
	"Subscription for an ownership transfer that didn't go through";

/** What ending the subscription a transfer replaces would do; reads Polar only. */
export const previewReplacedSubscription = async (
	subscriptionId: string,
	now: Date,
) => {
	const subscription = await polarClient.subscriptions.get(subscriptionId);
	if (!isBillable(subscription)) return { billable: false, refund: null };
	return {
		billable: true,
		refund: await planUnusedRefund(subscription, now),
	};
};

/**
 * Revokes the subscription a transfer replaced, then refunds the old owner's
 * unused time. `release` projects the revocation, for an organization still
 * bound to it. Throws when Polar refuses the read or the revoke; a failed
 * refund is only logged.
 */
export const endReplacedSubscription = async (
	subscriptionId: string,
	now: Date,
	{ release }: { release: boolean },
) => {
	const current = await polarClient.subscriptions.get(subscriptionId);
	if (!isBillable(current)) return { revoked: false, refund: null };
	const revoked = await polarClient.subscriptions.revoke(subscriptionId);
	if (release) await projectOwnSubscription(revoked);
	return {
		revoked: true,
		refund: await refundUnusedTime(current, now, UNUSED_TIME_COMMENT),
	};
};

export type TransferBlocker =
	| "not-found"
	| "inactive"
	| "suspended"
	| "pause-pending"
	| "cancel-pending"
	| PolarFailure;

/**
 * Why the organization can't be offered for transfer right now, or null. Its
 * bound subscription must be live in Polar with no pause or cancel pending:
 * the transfer revokes it, which would cut either short.
 */
export const findTransferBlocker = async (
	organizationId: string,
): Promise<TransferBlocker | null> => {
	const state = await getSubscriptionState(organizationId);
	if (!state) return "not-found";
	if (isSuspended(state)) return "suspended";
	if (state.status !== "active" || !state.subscriptionId) return "inactive";
	let subscription: Subscription;
	try {
		subscription = await polarClient.subscriptions.get(state.subscriptionId);
	} catch (error) {
		return toPolarFailure(error, "Polar subscription read failed", {
			organizationId,
		});
	}
	if (!isEntitled(subscription)) return "inactive";
	if (subscription.pause_at_period_end) return "pause-pending";
	if (subscription.cancel_at_period_end) return "cancel-pending";
	return null;
};

// open: not paid yet; confirmed: paid, Polar is still processing it
const REUSABLE_CHECKOUT_STATUSES: readonly string[] = ["open", "confirmed"];

export type TransferCheckout =
	| { ok: true; checkoutId: string; url: string; created: boolean }
	| { ok: false; error: PolarFailure };

/**
 * The recipient's checkout for the organization's current plan: the earlier
 * one while it can still be paid, otherwise a new one. Created directly, not
 * through the plugin's `/checkout`, whose guard refuses an active org.
 */
export const openTransferCheckout = async (input: {
	transferId: string;
	organizationId: string;
	userId: string;
	plan: PlanSlug;
	previousCheckoutId: string | null;
}): Promise<TransferCheckout> => {
	try {
		if (input.previousCheckoutId) {
			const previous = await polarClient.checkouts.get(
				input.previousCheckoutId,
			);
			if (REUSABLE_CHECKOUT_STATUSES.includes(previous.status))
				return {
					ok: true,
					checkoutId: previous.id,
					url: previous.url,
					created: false,
				};
		}
		const checkout = await polarClient.checkouts.create({
			products: [productIdFor(input.plan)],
			external_customer_id: input.userId,
			metadata: {
				referenceId: input.organizationId,
				transferId: input.transferId,
			},
			allow_trial: false,
			success_url: new URL(
				"/checkout/success?checkout_id={CHECKOUT_ID}",
				appConfig.WEB_APP_URL,
			).toString(),
		});
		return {
			ok: true,
			checkoutId: checkout.id,
			url: checkout.url,
			created: true,
		};
	} catch (error) {
		return {
			ok: false,
			error: toPolarFailure(error, "Polar transfer checkout failed", {
				transferId: input.transferId,
			}),
		};
	}
};

/** The checkout URL of an acceptance stored by a concurrent request. */
export const findCheckoutUrl = (checkoutId: string) =>
	polarClient.checkouts
		.get(checkoutId)
		.then((checkout) => checkout.url)
		.catch(() => null);

/**
 * Ends the old subscription once, after the transfer committed. Throws when
 * Polar refuses the revoke, so the webhook is retried and the next delivery
 * tries again.
 */
const settle = async (transfer: {
	id: string;
	organizationId: string;
	oldSubscriptionId: string | null;
	settledAt: Date | null;
}) => {
	if (transfer.settledAt) return;
	if (transfer.oldSubscriptionId) {
		try {
			await endReplacedSubscription(transfer.oldSubscriptionId, new Date(), {
				release: false,
			});
		} catch (error) {
			transferLogger.error("Revoking the replaced subscription failed", {
				transferId: transfer.id,
				organizationId: transfer.organizationId,
				subscriptionId: transfer.oldSubscriptionId,
				...describePolarError(error),
			});
			throw error;
		}
	}
	await settleOrganizationTransfer(transfer.id);
};

/**
 * A subscription bought for a transfer that no longer backs it: canceled,
 * declined or expired before the payment landed, a second checkout, or a
 * completion that was refused. Revoked and refunded in full; the refund is
 * retried on every delivery and only finds something left the first time.
 */
const unwindStray = async (subscription: Subscription, transferId: string) => {
	const context = { transferId, subscriptionId: subscription.id };
	if (isBillable(subscription)) {
		transferLogger.warn(
			"Revoking a subscription for a transfer that didn't go through",
			context,
		);
		await polarClient.subscriptions.revoke(subscription.id);
	}
	await refundInFull(subscription.id, STRAY_COMMENT);
};

/**
 * Projection of a subscription bought on a transfer's acceptance. The first
 * entitled state of an accepted transfer completes it; from then on the
 * subscription projects like any other.
 */
export const projectTransferSubscription = async (
	subscription: Subscription,
	transferId: string,
) => {
	const transfer = await findTransferById(transferId);

	if (
		transfer?.status === "completed" &&
		transfer.newSubscriptionId === subscription.id
	) {
		const status = await projectOwnSubscription(subscription);
		await settle(transfer);
		return status;
	}

	if (transfer?.status === "accepted") {
		if (!isEntitled(subscription)) return null;
		const completion = await completeOrganizationTransfer(
			transferId,
			subscription.id,
			planOf(subscription),
			new Date(subscription.modified_at ?? subscription.created_at),
		);
		if (completion.result === "completed") {
			transferLogger.info("Organization transferred", {
				transferId,
				organizationId: completion.transfer.organizationId,
				subscriptionId: subscription.id,
			});
			await settle(completion.transfer);
			return "active" as const;
		}
		if (completion.result === "refused")
			transferLogger.warn("Transfer refused on completion", {
				transferId,
				reason: completion.reason,
			});
	}

	// the transfer went with its organization or a user: whether this was ever
	// paid for service can't be told, so it is only stopped
	if (!transfer) {
		if (isBillable(subscription)) {
			transferLogger.error(
				"Subscription for an unknown transfer; revoking it, check whether to refund it in Polar",
				{ transferId, subscriptionId: subscription.id },
			);
			await polarClient.subscriptions.revoke(subscription.id);
		}
		return null;
	}

	await unwindStray(subscription, transferId);
	return null;
};
