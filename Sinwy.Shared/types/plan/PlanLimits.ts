import type { PlanSlug } from "./Plan";

/** Numeric caps per plan; `FEATURES` holds the yes/no entitlements. */
export type PlanLimits = {
	/** Every page counts, drafts included. */
	pages: number;
	/** How far back analytics reaches; older data is kept, only hidden. */
	analyticsRetentionDays: number;
};

export const PLAN_LIMITS: Record<PlanSlug, PlanLimits> = {
	starter: { pages: 1, analyticsRetentionDays: 30 },
	professional: { pages: 5, analyticsRetentionDays: 365 },
	enterprise: { pages: 25, analyticsRetentionDays: 730 },
};

const NO_PLAN_LIMITS: PlanLimits = { pages: 0, analyticsRetentionDays: 0 };

/** No plan (inactive organization) allows nothing. */
export const limitsFor = (plan: PlanSlug | null): PlanLimits =>
	plan ? PLAN_LIMITS[plan] : NO_PLAN_LIMITS;
