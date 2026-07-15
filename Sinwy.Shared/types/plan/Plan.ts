// Single source of truth for plan slugs: the backend maps them to Polar
// products, the frontend renders them — drift is a compile error on both sides.
export const PLAN_SLUGS = ["starter", "professional", "enterprise"] as const;

export type PlanSlug = (typeof PLAN_SLUGS)[number];
