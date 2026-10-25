import {
	type Feature,
	PLAN_FEATURES,
	PLAN_SLUGS,
	type PlanSlug,
} from "@sinwy/shared";

export type PlanChangeDirection = "upgrade" | "downgrade";

/** Matches the backend's "prorate" behaviour: the switch is immediate, money settles on the next renewal. */
export const PRORATION_COPY: Record<PlanChangeDirection, string> = {
	upgrade:
		"Takes effect now. Nothing is charged today; the prorated difference for the rest of this billing period is added to your next invoice.",
	downgrade:
		"Takes effect now. The unused part of this billing period on your current plan is credited on your next invoice.",
};

/** Relies on PLAN_SLUGS being ordered cheapest first. */
export function describePlanChange(from: PlanSlug, to: PlanSlug) {
	const direction: PlanChangeDirection =
		PLAN_SLUGS.indexOf(to) > PLAN_SLUGS.indexOf(from) ? "upgrade" : "downgrade";
	const missingFrom = (plan: PlanSlug) => (feature: Feature) =>
		!PLAN_FEATURES[plan].includes(feature);

	return {
		direction,
		gained: PLAN_FEATURES[to].filter(missingFrom(from)),
		lost: PLAN_FEATURES[from].filter(missingFrom(to)),
	};
}
