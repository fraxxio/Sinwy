import { afterEach, expect, spyOn, test } from "bun:test";
import { type PolarModels, polarClient } from "@backend/infrastructure/polar";
import { refundInFull } from "../refunds";

type Order = PolarModels.Order;

const spies: { mockRestore: () => void }[] = [];
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});

const paidOrder = (overrides: Partial<Order> = {}) =>
	({
		id: "order_1",
		paid: true,
		net_amount: 3000,
		refundable_amount: 3000,
		...overrides,
	}) as Order;

const stubOrders = (orders: Order[]) => {
	const list = spyOn(polarClient.orders, "list").mockResolvedValue({
		items: orders,
		pagination: { total_count: orders.length, max_page: 1 },
	} as never);
	const create = spyOn(polarClient.refunds, "create").mockResolvedValue(
		{} as never,
	);
	spies.push(list, create);
	return { list, create };
};

test("refundInFull refunds everything still refundable on every paid order", async () => {
	const { list, create } = stubOrders([
		paidOrder({ id: "order_a", refundable_amount: 3000 }),
		paidOrder({ id: "order_b", refundable_amount: 1200 }),
	]);
	expect(await refundInFull("sub_1", "c")).toEqual([
		{ result: "refunded", orderId: "order_a", amount: 3000 },
		{ result: "refunded", orderId: "order_b", amount: 1200 },
	]);
	expect(list.mock.calls[0]?.[0]).toMatchObject({ subscription_id: "sub_1" });
	expect(create).toHaveBeenCalledTimes(2);
});

test("refundInFull skips unpaid and fully refunded orders", async () => {
	const { create } = stubOrders([
		paidOrder({ paid: false }),
		paidOrder({ refundable_amount: 0 }),
	]);
	expect(await refundInFull("sub_1", "c")).toEqual([]);
	expect(create).not.toHaveBeenCalled();
});

test("a refused refund is reported, not thrown", async () => {
	const { create } = stubOrders([paidOrder()]);
	create.mockRejectedValue(new Error("refused"));
	expect(await refundInFull("sub_1", "c")).toEqual([{ result: "failed" }]);
});
