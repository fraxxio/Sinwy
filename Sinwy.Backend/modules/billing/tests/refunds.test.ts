import { afterEach, expect, spyOn, test } from "bun:test";
import { type PolarModels, polarClient } from "@backend/infrastructure/polar";
import { refundInFull, refundUnusedTime, unusedAmount } from "../refunds";

type Subscription = PolarModels.Subscription;
type Order = PolarModels.Order;

const period = {
	start: new Date("2026-10-01T00:00:00Z"),
	end: new Date("2026-10-31T00:00:00Z"),
};
const order = { net_amount: 3000, refundable_amount: 3000 };
const day = 24 * 60 * 60 * 1000;

test("unused amount: all of it at period start, half in the middle, one day's worth on the last day", () => {
	expect(unusedAmount(order, period, period.start)).toBe(3000);
	expect(unusedAmount(order, period, new Date("2026-10-16T00:00:00Z"))).toBe(
		1500,
	);
	expect(
		unusedAmount(order, period, new Date(period.end.getTime() - day)),
	).toBe(100);
});

test("unused amount: nothing after the period, never more than is still refundable", () => {
	expect(unusedAmount(order, period, period.end)).toBe(0);
	expect(unusedAmount(order, period, new Date("2026-11-05T00:00:00Z"))).toBe(0);
	expect(
		unusedAmount(
			{ net_amount: 3000, refundable_amount: 1000 },
			period,
			period.start,
		),
	).toBe(1000);
	expect(
		unusedAmount(order, { start: period.end, end: period.end }, period.start),
	).toBe(0);
});

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

const subscription = {
	id: "sub_1",
	current_period_start: period.start.toISOString(),
	current_period_end: period.end.toISOString(),
} as Subscription;

test("refundUnusedTime refunds the prorated share of the latest paid order", async () => {
	const { list, create } = stubOrders([
		paidOrder({ id: "order_new" }),
		paidOrder({ id: "order_old" }),
	]);

	const outcome = await refundUnusedTime(
		subscription,
		new Date("2026-10-16T00:00:00Z"),
		"comment",
	);

	expect(outcome).toEqual({
		result: "refunded",
		orderId: "order_new",
		amount: 1500,
	});
	expect(list.mock.calls[0]?.[0]).toMatchObject({
		subscription_id: "sub_1",
		sorting: ["-created_at"],
	});
	expect(create.mock.calls[0]?.[0]).toMatchObject({
		order_id: "order_new",
		amount: 1500,
	});
});

test("refundUnusedTime skips unpaid, fully refunded and free orders", async () => {
	const { create } = stubOrders([
		paidOrder({ paid: false }),
		paidOrder({ refundable_amount: 0 }),
	]);
	expect(await refundUnusedTime(subscription, period.start, "c")).toEqual({
		result: "nothing-to-refund",
	});
	expect(create).not.toHaveBeenCalled();
});

test("a refused refund is reported, not thrown", async () => {
	const { create } = stubOrders([paidOrder()]);
	create.mockRejectedValue(new Error("refused"));
	expect(await refundUnusedTime(subscription, period.start, "c")).toEqual({
		result: "failed",
	});
});

test("refundInFull refunds everything still refundable on every paid order", async () => {
	const { create } = stubOrders([
		paidOrder({ id: "order_a", refundable_amount: 3000 }),
		paidOrder({ id: "order_b", refundable_amount: 1200 }),
	]);
	expect(await refundInFull("sub_1", "c")).toEqual([
		{ result: "refunded", orderId: "order_a", amount: 3000 },
		{ result: "refunded", orderId: "order_b", amount: 1200 },
	]);
	expect(create).toHaveBeenCalledTimes(2);
});
