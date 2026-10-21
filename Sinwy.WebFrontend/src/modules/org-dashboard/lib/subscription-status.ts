import type {
	OrganizationSubscriptionDto,
	SubscriptionBillingDto,
} from "@sinwy/shared";
import { formatMinorUnits } from "#/shared/lib/money";

export type SubscriptionDescription = {
	label: string;
	variant: "default" | "secondary" | "destructive" | "outline";
	/** null only when the organization is active but Polar's details are unavailable. */
	detail: string | null;
};

const formatDate = (iso: string, locale?: string) =>
	new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
		new Date(iso),
	);

/** Badge and sentence for the billing page, kept together so they never disagree. */
export function describeSubscription(
	subscription: OrganizationSubscriptionDto,
	locale?: string,
): SubscriptionDescription {
	if (subscription.status !== "active")
		return {
			label: "Inactive",
			variant: "destructive",
			detail: "This organization has no active plan.",
		};

	const { billing } = subscription;
	if (!billing) return { label: "Active", variant: "default", detail: null };

	const date = (iso: string) => formatDate(iso, locale);

	switch (billing.subscriptionStatus) {
		case "past_due":
		case "unpaid":
			return {
				label: "Payment failed",
				variant: "destructive",
				detail: "Update your payment method on Polar to keep your plan.",
			};
		case "incomplete":
		case "incomplete_expired":
			return {
				label: "Payment pending",
				variant: "secondary",
				detail: "Polar is still confirming the payment.",
			};
	}

	if (billing.cancelAtPeriodEnd || billing.subscriptionStatus === "canceled")
		return {
			label: `Cancels on ${date(billing.endsAt ?? billing.currentPeriodEnd)}`,
			variant: "outline",
			detail: "You keep access until then. Resume from the Polar portal.",
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

/** "$48.00 / month" */
export const formatPrice = (
	billing: Pick<SubscriptionBillingDto, "amount" | "currency" | "interval">,
	locale?: string,
) =>
	`${formatMinorUnits(billing.amount, billing.currency, locale)} / ${billing.interval}`;
