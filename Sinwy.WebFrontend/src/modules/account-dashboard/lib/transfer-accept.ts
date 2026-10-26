import {
	type AccountSubscriptionDto,
	PLAN_ORGANIZATION_LIMITS,
	PLAN_SLUGS,
	type PlanSlug,
} from "@sinwy/shared";

/** What accepting an ownership offer takes, by the recipient's plan. */
export type AcceptPath =
	| { kind: "slot"; plan: PlanSlug }
	| { kind: "upgrade"; from: PlanSlug; to: PlanSlug }
	| { kind: "full"; plan: PlanSlug }
	| { kind: "suspended" }
	| { kind: "buy" };

/** An upgrade goes to the cheapest tier with room; relies on PLAN_SLUGS being ordered cheapest first. */
export function acceptPathFor(
	subscription: Pick<
		AccountSubscriptionDto,
		"plan" | "suspended" | "organizationLimit" | "activeOrganizations"
	>,
): AcceptPath {
	if (subscription.suspended) return { kind: "suspended" };
	const { plan } = subscription;
	if (!plan) return { kind: "buy" };
	const held = subscription.activeOrganizations.length;
	if (held < subscription.organizationLimit) return { kind: "slot", plan };
	const to = PLAN_SLUGS.slice(PLAN_SLUGS.indexOf(plan) + 1).find(
		(slug) => PLAN_ORGANIZATION_LIMITS[slug] > held,
	);
	return to ? { kind: "upgrade", from: plan, to } : { kind: "full", plan };
}
