import type {
	AccountSubscriptionDto,
	SubscriptionBillingDto,
} from "@sinwy/shared";
import { formatDay } from "#/shared/lib/date";
import { formatMinorUnits } from "#/shared/lib/money";

export type SubscriptionDescription = {
	label: string;
	variant: "default" | "secondary" | "destructive" | "outline";
	/** null only when the plan grants access but Polar's details are unavailable. */
	detail: string | null;
};

/** Badge and sentence for the billing page, kept together so they never disagree. */
export function describeSubscription(
	subscription: Pick<AccountSubscriptionDto, "plan" | "suspended" | "billing">,
	locale?: string,
): SubscriptionDescription {
	const { billing } = subscription;
	if (subscription.suspended || billing?.subscriptionStatus === "paused")
		return {
			label: "Suspended",
			variant: "secondary",
			detail:
				"Your organizations are offline until you resume it. Resuming charges for a new period right away.",
		};

	if (subscription.plan === null)
		return {
			label: "Inactive",
			variant: "destructive",
			detail: "You have no active plan.",
		};

	if (!billing) return { label: "Active", variant: "default", detail: null };

	const date = (iso: string) => formatDay(iso, locale);

	switch (billing.subscriptionStatus) {
		case "past_due":
		case "unpaid":
			return {
				label: "Payment failed",
				variant: "destructive",
				detail: "Update your payment method on Polar to keep your plan.",
			};
		case "incomplete":
			return {
				label: "Payment pending",
				variant: "secondary",
				detail: "Polar is still confirming the payment.",
			};
		case "incomplete_expired":
			return {
				label: "Payment failed",
				variant: "destructive",
				detail: "The first payment was never completed.",
			};
		// Polar sets canceled once access ends, cancel at period end included
		case "canceled":
			return {
				label: "Canceled",
				variant: "destructive",
				detail: "The subscription has ended.",
			};
	}

	if (billing.cancelAtPeriodEnd)
		return {
			label: `Cancels on ${date(billing.endsAt ?? billing.currentPeriodEnd)}`,
			variant: "outline",
			detail: "You keep access until then. Resume from the Polar portal.",
		};

	if (billing.pauseAtPeriodEnd)
		return {
			label: `Suspends on ${date(billing.currentPeriodEnd)}`,
			variant: "outline",
			detail: "You keep access until then. Undo it below to keep it running.",
		};

	if (billing.subscriptionStatus === "trialing")
		return {
			label: "Trial",
			variant: "secondary",
			detail: `Trial ends ${date(billing.currentPeriodEnd)}`,
		};

	return {
		label: "Active",
		variant: "default",
		detail: `Renews on ${date(billing.currentPeriodEnd)}`,
	};
}

/**
 * Why the owner can't schedule a suspension now, or null when they can. A
 * pending suspension is its own state, undone rather than scheduled.
 */
export function suspensionBlocker(
	billing: SubscriptionBillingDto | null,
): string | null {
	if (!billing) return "Billing details are unavailable right now.";
	if (billing.cancelAtPeriodEnd) return "The subscription is set to cancel.";
	switch (billing.subscriptionStatus) {
		case "active":
			return null;
		// Polar only pauses an active subscription
		case "trialing":
			return "A subscription can't be suspended during its trial.";
		case "past_due":
		case "unpaid":
			return "The last payment failed. Update your payment method on Polar first.";
		default:
			return "There's no active subscription to suspend.";
	}
}

/** "$48.00 / month", "$120.00 / 3 months" */
export const formatPrice = (
	billing: Pick<
		SubscriptionBillingDto,
		"amount" | "currency" | "interval" | "intervalCount"
	>,
	locale?: string,
) => {
	const period =
		billing.intervalCount > 1
			? `${billing.intervalCount} ${billing.interval}s`
			: billing.interval;
	return `${formatMinorUnits(billing.amount, billing.currency, locale)} / ${period}`;
};
