import { describe, expect, it } from "bun:test";
import type {
	AccountSubscriptionDto,
	PlanSlug,
	SubscriptionBillingDto,
} from "@sinwy/shared";
import {
	describeSubscription,
	formatPrice,
	suspensionBlocker,
} from "../lib/subscription-status";

const billing: SubscriptionBillingDto = {
	subscriptionStatus: "active",
	amount: 4800,
	currency: "USD",
	interval: "month",
	intervalCount: 1,
	currentPeriodEnd: "2026-11-21T12:00:00Z",
	cancelAtPeriodEnd: false,
	endsAt: null,
	pauseAtPeriodEnd: false,
	resumesAt: null,
};

const subscription = (
	overrides: Partial<SubscriptionBillingDto> = {},
	plan: PlanSlug | null = "professional",
): AccountSubscriptionDto => ({
	plan,
	suspended: false,
	organizationLimit: plan ? 2 : 0,
	activeOrganizations: 1,
	billing: { ...billing, ...overrides },
});

const describeIn = (dto: AccountSubscriptionDto) =>
	describeSubscription(dto, "en-US");

describe("describeSubscription", () => {
	it("marks a user without a plan inactive regardless of Polar's status", () => {
		expect(describeIn(subscription({}, null))).toMatchObject({
			label: "Inactive",
			variant: "destructive",
		});
	});

	it("reports a suspended plan as suspended, not lapsed", () => {
		expect(
			describeIn({
				...subscription({ subscriptionStatus: "paused" }, null),
				suspended: true,
			}),
		).toMatchObject({ label: "Suspended", variant: "secondary" });
	});

	it("reports a paused subscription as suspended, even before the plan is", () => {
		expect(
			describeIn(subscription({ subscriptionStatus: "paused" })),
		).toMatchObject({ label: "Suspended" });
	});

	it("reports a suspended plan whose billing is unavailable as suspended", () => {
		expect(
			describeIn({
				...subscription({}, null),
				suspended: true,
				billing: null,
			}).label,
		).toBe("Suspended");
	});

	it("shows when a scheduled suspension takes effect", () => {
		expect(describeIn(subscription({ pauseAtPeriodEnd: true }))).toEqual({
			label: "Suspends on Nov 21, 2026",
			variant: "outline",
			detail: "You keep access until then. Undo it below to keep it running.",
		});
	});

	it("reports a failed payment", () => {
		for (const subscriptionStatus of ["past_due", "unpaid"] as const)
			expect(describeIn(subscription({ subscriptionStatus }))).toEqual({
				label: "Payment failed",
				variant: "destructive",
				detail: "Update your payment method on Polar to keep your plan.",
			});
	});

	it("tells a pending first payment from one that expired", () => {
		expect(
			describeIn(subscription({ subscriptionStatus: "incomplete" })),
		).toEqual({
			label: "Payment pending",
			variant: "secondary",
			detail: "Polar is still confirming the payment.",
		});
		expect(
			describeIn(subscription({ subscriptionStatus: "incomplete_expired" })),
		).toEqual({
			label: "Payment failed",
			variant: "destructive",
			detail: "The first payment was never completed.",
		});
	});

	it("reports an ended subscription as canceled, never as cancelling", () => {
		for (const cancelAtPeriodEnd of [false, true])
			expect(
				describeIn(
					subscription({
						subscriptionStatus: "canceled",
						cancelAtPeriodEnd,
						endsAt: "2026-10-01T12:00:00Z",
					}),
				),
			).toEqual({
				label: "Canceled",
				variant: "destructive",
				detail: "The subscription has ended.",
			});
	});

	it("prefers the end date when cancelling at period end", () => {
		expect(
			describeIn(
				subscription({
					cancelAtPeriodEnd: true,
					endsAt: "2026-12-01T12:00:00Z",
				}),
			),
		).toEqual({
			label: "Cancels on Dec 1, 2026",
			variant: "outline",
			detail: "You keep access until then. Resume from the Polar portal.",
		});
	});

	it("falls back to the period end when cancelling without an end date", () => {
		expect(describeIn(subscription({ cancelAtPeriodEnd: true })).label).toBe(
			"Cancels on Nov 21, 2026",
		);
	});

	it("shows when a trial ends", () => {
		expect(
			describeIn(subscription({ subscriptionStatus: "trialing" })),
		).toEqual({
			label: "Trial",
			variant: "secondary",
			detail: "Trial ends Nov 21, 2026",
		});
	});

	it("shows the renewal date for an active subscription", () => {
		expect(describeIn(subscription())).toEqual({
			label: "Active",
			variant: "default",
			detail: "Renews on Nov 21, 2026",
		});
	});

	it("never says renews when Polar's details are unavailable", () => {
		expect(describeIn({ ...subscription(), billing: null })).toEqual({
			label: "Active",
			variant: "default",
			detail: null,
		});
	});
});

it("formats the price with its interval", () => {
	expect(formatPrice(billing, "en-US")).toBe("$48.00 / month");
	expect(
		formatPrice(
			{ amount: 4800, currency: "JPY", interval: "year", intervalCount: 1 },
			"en-US",
		),
	).toBe("¥4,800 / year");
	expect(formatPrice({ ...billing, intervalCount: 3 }, "en-US")).toBe(
		"$48.00 / 3 months",
	);
});

describe("suspensionBlocker", () => {
	it("lets an active subscription be suspended", () => {
		expect(suspensionBlocker(billing)).toBeNull();
	});

	it.each([
		["a trial", { subscriptionStatus: "trialing" }, "during its trial"],
		["a failed payment", { subscriptionStatus: "past_due" }, "payment failed"],
		["a pending cancellation", { cancelAtPeriodEnd: true }, "set to cancel"],
		["an ended subscription", { subscriptionStatus: "canceled" }, "no active"],
	] as const)("refuses %s", (_, overrides, reason) => {
		expect(suspensionBlocker({ ...billing, ...overrides })).toContain(reason);
	});

	it("refuses while billing details are unavailable", () => {
		expect(suspensionBlocker(null)).toContain("unavailable");
	});
});
