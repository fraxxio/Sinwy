// Single source of truth for plan slugs: the backend maps them to Polar
// products, the frontend renders them — drift is a compile error on both sides.
export const PLAN_SLUGS = ["starter", "professional", "enterprise"] as const;

export type PlanSlug = (typeof PLAN_SLUGS)[number];

/** Lenient on purpose: an unknown stored plan must degrade to "no features", not fail every request. */
export const toPlanSlug = (value: string | null): PlanSlug | null =>
	PLAN_SLUGS.find((slug) => slug === value) ?? null;
