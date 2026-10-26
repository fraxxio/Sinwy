import {
	type Feature,
	PLAN_FEATURES,
	PLAN_ORGANIZATION_LIMITS,
	PLAN_SLUGS,
	type PlanSlug,
} from "@sinwy/shared";
import { formatDay } from "#/shared/lib/date";

export type PlanChangeDirection = "upgrade" | "downgrade";

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

/** When the change applies, as the backend runs it: an upgrade now and prorated, a downgrade at the renewal. */
export function describeTiming(
	direction: PlanChangeDirection,
	periodEnd: string | null,
	locale?: string,
) {
	if (direction === "upgrade")
		return "Takes effect now. Nothing is charged today; the prorated difference for the rest of this billing period is added to your next invoice.";
	const when = periodEnd ? `on ${formatDay(periodEnd, locale)}` : "at renewal";
	return `Takes effect ${when}, when this billing period ends. You keep your current plan until then, and nothing is credited.`;
}

/** How many active organizations the user keeps on `to`; null when they all fit, so none need choosing. */
export function organizationsToKeep(activeCount: number, to: PlanSlug) {
	const limit = PLAN_ORGANIZATION_LIMITS[to];
	return activeCount > limit ? limit : null;
}
