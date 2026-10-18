import { z } from "zod";
import type { OrganizationStatus } from "../organization/Organization";
import { PLAN_SLUGS, type PlanSlug } from "./Plan";
import type { Feature } from "./PlanFeatures";

export type SubscriptionBillingStatus =
	| "incomplete"
	| "incomplete_expired"
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "unpaid";

/** Live from Polar; money in integer minor units, dates as ISO strings. */
export type SubscriptionBillingDto = {
	subscriptionStatus: SubscriptionBillingStatus;
	amount: number;
	currency: string;
	interval: "day" | "week" | "month" | "year";
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
