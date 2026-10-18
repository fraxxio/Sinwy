import appConfig from "@config";
import { PLAN_SLUGS, type PlanSlug } from "@sinwy/shared";

// keyed by PlanSlug so adding/renaming a plan in @sinwy/shared fails here at compile time
const planProducts = {
	starter: appConfig.POLAR_PRODUCT_STARTER,
	professional: appConfig.POLAR_PRODUCT_PROFESSIONAL,
	enterprise: appConfig.POLAR_PRODUCT_ENTERPRISE,
} satisfies Record<PlanSlug, string>;

// Many-to-one: a plan is what the organization is entitled to, a product is
// how it pays, so e.g. a yearly product maps to the same plan here.
const planByProduct = new Map<string, PlanSlug>(
	PLAN_SLUGS.map((plan) => [planProducts[plan], plan]),
);

export const productIdFor = (plan: PlanSlug) => planProducts[plan];

/** null for a product no plan maps to, e.g. one from another Polar environment. */
export const planFor = (productId: string): PlanSlug | null =>
	planByProduct.get(productId) ?? null;
