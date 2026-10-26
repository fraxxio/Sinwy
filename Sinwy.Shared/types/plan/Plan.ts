// Single source of truth for plan slugs: the backend maps them to Polar
// products, the frontend renders them — drift is a compile error on both sides.
// Ordered cheapest first.
export const PLAN_SLUGS = ["starter", "professional", "enterprise"] as const;

export type PlanSlug = (typeof PLAN_SLUGS)[number];

/** Whether `to` is a more expensive tier than `from`. */
export const isUpgrade = (from: PlanSlug, to: PlanSlug) =>
	PLAN_SLUGS.indexOf(to) > PLAN_SLUGS.indexOf(from);

/** Lenient on purpose: an unknown stored plan must degrade to "no features", not fail every request. */
export const toPlanSlug = (value: string | null): PlanSlug | null =>
	PLAN_SLUGS.find((slug) => slug === value) ?? null;

/** Organizations an owner can keep active at once on each plan. */
export const PLAN_ORGANIZATION_LIMITS: Record<PlanSlug, number> = {
	starter: 1,
	professional: 2,
	enterprise: 5,
};
