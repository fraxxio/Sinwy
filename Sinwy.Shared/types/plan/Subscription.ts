import { z } from "zod";
import { PLAN_SLUGS, type PlanSlug } from "./Plan";

export const SUBSCRIPTION_BILLING_STATUSES = [
	"incomplete",
	"incomplete_expired",
	"trialing",
	"active",
	"past_due",
	"canceled",
	"unpaid",
	"paused",
] as const;

export type SubscriptionBillingStatus =
	(typeof SUBSCRIPTION_BILLING_STATUSES)[number];

/** Statuses that grant access; past_due too, since Polar's dunning retries are the grace period. */
export const ENTITLED_SUBSCRIPTION_STATUSES: readonly SubscriptionBillingStatus[] =
	["active", "trialing", "past_due"];

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
	/** Suspends on `currentPeriodEnd`; can still be undone. */
	pauseAtPeriodEnd: boolean;
	/** When Polar resumes a paused subscription by itself; null until resumed by hand. */
	resumesAt: string | null;
};

/** The user's own plan, which every organization they own runs on. */
export type AccountSubscriptionDto = {
	/** null without a plan that grants access. */
	plan: PlanSlug | null;
	/** Paused by its owner: it resumes without a new checkout. */
	suspended: boolean;
	/** Organizations the plan keeps active at once; 0 without a plan. */
	organizationLimit: number;
	/** Owned organizations holding a slot, not scheduled for deletion. */
	activeOrganizations: number;
	/** null when there is no subscription or Polar could not be reached. */
	billing: SubscriptionBillingDto | null;
};

export const changePlanBody = z.object({ plan: z.enum(PLAN_SLUGS) });

export type ChangePlanBody = z.infer<typeof changePlanBody>;
