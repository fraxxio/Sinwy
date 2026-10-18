import type { PlanSlug } from "./Plan";

// Only add a feature once a gate checks it; numeric limits ("up to 3
// members") are a different shape and don't belong here.
export const FEATURES = [
	"page-builder",
	"custom-domain",
	"analytics-advanced",
	"multi-location",
] as const;

export type Feature = (typeof FEATURES)[number];

// Written out per plan so the matrix reads at a glance and tests can pin it.
export const PLAN_FEATURES: Record<PlanSlug, readonly Feature[]> = {
	starter: [],
	professional: ["page-builder", "custom-domain", "analytics-advanced"],
	enterprise: [
		"page-builder",
		"custom-domain",
		"analytics-advanced",
		"multi-location",
	],
};

/** No plan (inactive organization) entitles nothing. */
export const featuresFor = (plan: PlanSlug | null): readonly Feature[] =>
	plan ? PLAN_FEATURES[plan] : [];

export const hasFeature = (plan: PlanSlug | null, feature: Feature): boolean =>
	featuresFor(plan).includes(feature);
