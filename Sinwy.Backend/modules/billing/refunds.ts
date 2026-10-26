import {
	describePolarError,
	type PolarModels,
	polarClient,
} from "@backend/infrastructure/polar";
import { createLogger } from "@logger";

type Order = PolarModels.Order;

const refundLogger = createLogger("billing:refunds");

type PlannedRefund = { orderId: string; amount: number };

export type RefundOutcome =
	| { result: "refunded"; orderId: string; amount: number }
	| { result: "failed" };

const paidOrders = async (subscriptionId: string) => {
	const { items } = await polarClient.orders.list({
		subscription_id: subscriptionId,
		sorting: ["-created_at"],
		limit: 100,
	});
	return items.filter((order) => order.paid && order.refundable_amount > 0);
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
