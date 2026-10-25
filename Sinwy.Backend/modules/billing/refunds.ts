import {
	describePolarError,
	type PolarModels,
	polarClient,
} from "@backend/infrastructure/polar";
import { createLogger } from "@logger";

type Subscription = PolarModels.Subscription;
type Order = PolarModels.Order;

const refundLogger = createLogger("billing:refunds");

export type PlannedRefund = { orderId: string; amount: number };

export type RefundOutcome =
	| { result: "refunded"; orderId: string; amount: number }
	| { result: "nothing-to-refund" }
	| { result: "failed" };

/**
 * The unused share of `order`, prorated by time over the period it paid for,
 * in the order's net (pre-tax) cents; Polar refunds the matching tax itself.
 */
export const unusedAmount = (
	order: Pick<Order, "net_amount" | "refundable_amount">,
	period: { start: Date; end: Date },
	now: Date,
) => {
	const length = period.end.getTime() - period.start.getTime();
	if (length <= 0) return 0;
	const unused = Math.min(
		Math.max((period.end.getTime() - now.getTime()) / length, 0),
		1,
	);
	return Math.min(
		Math.floor(order.net_amount * unused),
		order.refundable_amount,
	);
};

const paidOrders = async (subscriptionId: string) => {
	const { items } = await polarClient.orders.list({
		subscription_id: subscriptionId,
		sorting: ["-created_at"],
		limit: 100,
	});
	return items.filter((order) => order.paid && order.refundable_amount > 0);
};

/** What refunding the unused time of the subscription's last paid order would return. */
export const planUnusedRefund = async (
	subscription: Subscription,
	now: Date,
): Promise<PlannedRefund | null> => {
	const [order] = await paidOrders(subscription.id);
	if (!order || !subscription.current_period_end) return null;
	const amount = unusedAmount(
		order,
		{
			start: new Date(subscription.current_period_start),
			end: new Date(subscription.current_period_end),
		},
		now,
	);
	return amount > 0 ? { orderId: order.id, amount } : null;
};

const refund = async (
	subscriptionId: string,
	planned: PlannedRefund,
	comment: string,
): Promise<RefundOutcome> => {
	try {
		await polarClient.refunds.create({
			order_id: planned.orderId,
			amount: planned.amount,
			reason: "customer_request",
			comment,
		});
		refundLogger.info("Refunded", { subscriptionId, ...planned });
		return { result: "refunded", ...planned };
	} catch (error) {
		refundLogger.error("Refund failed; refund it manually in Polar", {
			subscriptionId,
			...planned,
			...describePolarError(error),
		});
		return { result: "failed" };
	}
};

/**
 * Refunds the time left in the subscription's current period. Never throws:
 * a failure is logged for a manual refund.
 */
export const refundUnusedTime = async (
	subscription: Subscription,
	now: Date,
	comment: string,
): Promise<RefundOutcome> => {
	let planned: PlannedRefund | null;
	try {
		planned = await planUnusedRefund(subscription, now);
	} catch (error) {
		refundLogger.error("Order lookup failed; refund it manually in Polar", {
			subscriptionId: subscription.id,
			...describePolarError(error),
		});
		return { result: "failed" };
	}
	if (!planned) return { result: "nothing-to-refund" };
	return refund(subscription.id, planned, comment);
};

/** Refunds everything still refundable on the subscription's orders. Never throws. */
export const refundInFull = async (
	subscriptionId: string,
	comment: string,
): Promise<RefundOutcome[]> => {
	let orders: Order[];
	try {
		orders = await paidOrders(subscriptionId);
	} catch (error) {
		refundLogger.error("Order lookup failed; refund it manually in Polar", {
			subscriptionId,
			...describePolarError(error),
		});
		return [{ result: "failed" }];
	}
	const outcomes: RefundOutcome[] = [];
	for (const order of orders)
		outcomes.push(
			await refund(
				subscriptionId,
				{ orderId: order.id, amount: order.refundable_amount },
				comment,
			),
		);
	return outcomes;
};
