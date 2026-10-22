import { z } from "zod";
import type { OrganizationStatus } from "../organization/Organization";
import { PLAN_SLUGS, type PlanSlug } from "./Plan";
import type { Feature } from "./PlanFeatures";

export const SUBSCRIPTION_BILLING_STATUSES = [
	"incomplete",
	"incomplete_expired",
	"trialing",
	"active",
	"past_due",
	"canceled",
	"unpaid",
] as const;

export type SubscriptionBillingStatus =
	(typeof SUBSCRIPTION_BILLING_STATUSES)[number];

export const BILLING_INTERVALS = ["day", "week", "month", "year"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Live from Polar; money in integer minor units, dates as ISO strings. */
export type SubscriptionBillingDto = {
	subscriptionStatus: SubscriptionBillingStatus;
	amount: number;
	currency: string;
	interval: BillingInterval;
	/** Billed every `intervalCount` intervals, e.g. 3 × month. */
	intervalCount: number;
	/** Renewal date, or the end date when `cancelAtPeriodEnd` is set. */
	currentPeriodEnd: string;
	cancelAtPeriodEnd: boolean;
	endsAt: string | null;
};

export type OrganizationSubscriptionDto = {
	status: OrganizationStatus;
	plan: PlanSlug | null;
	features: readonly Feature[];
	/** null when there is no subscription or Polar could not be reached. */
	billing: SubscriptionBillingDto | null;
};

export const changePlanBody = z.object({ plan: z.enum(PLAN_SLUGS) });

export type ChangePlanBody = z.infer<typeof changePlanBody>;
