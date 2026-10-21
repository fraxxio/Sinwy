import { describe, expect, it } from "bun:test";
import type {
	OrganizationSubscriptionDto,
	SubscriptionBillingDto,
} from "@sinwy/shared";
import { describeSubscription, formatPrice } from "../lib/subscription-status";

// noon UTC so the formatted day is the same in every test-runner timezone
const billing: SubscriptionBillingDto = {
	subscriptionStatus: "active",
	amount: 4800,
	currency: "USD",
	interval: "month",
	currentPeriodEnd: "2026-11-21T12:00:00Z",
	cancelAtPeriodEnd: false,
	endsAt: null,
};

const subscription = (
	overrides: Partial<SubscriptionBillingDto> = {},
	status: OrganizationSubscriptionDto["status"] = "active",
): OrganizationSubscriptionDto => ({
	status,
	plan: "professional",
	features: [],
	billing: { ...billing, ...overrides },
});

const describeIn = (dto: OrganizationSubscriptionDto) =>
	describeSubscription(dto, "en-US");

describe("describeSubscription", () => {
	it("marks an inactive organization regardless of Polar's status", () => {
		expect(describeIn(subscription({}, "inactive"))).toMatchObject({
			label: "Inactive",
			variant: "destructive",
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
		formatPrice({ amount: 4800, currency: "JPY", interval: "year" }, "en-US"),
	).toBe("¥4,800 / year");
});
