import {
	type Feature,
	PLAN_FEATURES,
	PLAN_LIMITS,
	PLAN_SLUGS,
	type PlanSlug,
} from "@sinwy/shared";

export const PLAN_NAMES: Record<PlanSlug, string> = {
	starter: "Starter",
	professional: "Business",
	enterprise: "Enterprise",
};

export const getPlanName = (slug: PlanSlug) => PLAN_NAMES[slug];

/** Catalogue list prices in whole US dollars, before tax. */
export const PLAN_PRICES: Record<PlanSlug, Record<"month" | "year", number>> = {
	starter: { month: 12, year: 99 },
	professional: { month: 48, year: 399 },
	enterprise: { month: 96, year: 899 },
};

export const FEATURE_NAMES: Record<Feature, string> = {
	"advanced-widgets": "Advanced widgets",
	"custom-domain": "Custom domain",
	"analytics-advanced": "Advanced analytics",
	"multi-location": "Multiple locations",
};

/** Cheapest plan that includes the feature; relies on PLAN_SLUGS being ordered cheapest first. */
export const minimumPlanFor = (feature: Feature): PlanSlug | null =>
	PLAN_SLUGS.find((slug) => PLAN_FEATURES[slug].includes(feature)) ?? null;

/** Cheapest plan that allows `count` pages; null when none does. */
export const minimumPlanForPages = (count: number): PlanSlug | null =>
	PLAN_SLUGS.find((slug) => PLAN_LIMITS[slug].pages >= count) ?? null;
