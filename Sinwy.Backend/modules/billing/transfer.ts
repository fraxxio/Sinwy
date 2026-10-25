import { polarClient } from "@backend/infrastructure/polar";
import { isBillable, projectSubscription } from "./projection";
import { planUnusedRefund, refundUnusedTime } from "./refunds";

const UNUSED_TIME_COMMENT = "Unused time after an ownership transfer";

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
 * Revokes the subscription a transfer replaces, projects the revocation (which
 * releases the organization if it is still bound to it), then refunds the
 * old owner's unused time. Throws when Polar refuses the read or the revoke;
 * a failed refund is only logged.
 */
export const endReplacedSubscription = async (
	subscriptionId: string,
	now: Date,
) => {
	const current = await polarClient.subscriptions.get(subscriptionId);
	if (!isBillable(current)) return { revoked: false, refund: null };
	const revoked = await polarClient.subscriptions.revoke(subscriptionId);
	await projectSubscription(revoked);
	return {
		revoked: true,
		refund: await refundUnusedTime(current, now, UNUSED_TIME_COMMENT),
	};
};
