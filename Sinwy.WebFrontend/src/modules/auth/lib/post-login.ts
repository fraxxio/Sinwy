import { isLapsed } from "#/modules/organizations/lib/funnel";

/**
 * Where a signed-in user lands after login: active (or most recent) org →
 * Organization Mode. An organization that never got paid sends whoever can
 * buy its plan back to the plan page (the payment funnel must stay
 * reachable); a lapsed one, or one its member can't pay for, opens the
 * read-only dashboard, where the banner says what's next. No orgs → Customer
 * Mode. Unfinished onboarding is not routed here — `UnfinishedOnboardingToast`
 * prompts for it from the root on every route outside the funnel. No-session
 * is handled by the route guard, not here.
 */
export async function postLoginDestination(
	organizations: {
		id: string;
		slug: string;
		status: string;
		onboardingCompletedAt?: Date | null;
	}[],
	activeOrgId: string | null | undefined,
	canBuyPlan: (organizationId: string) => Promise<boolean>,
) {
	const org =
		organizations.find((o) => o.id === activeOrgId) ?? organizations.at(-1);
	if (!org) return { to: "/account" } as const;
	if (org.status !== "active" && !isLapsed(org) && (await canBuyPlan(org.id)))
		return { to: "/organizations/$id/plan", params: { id: org.id } } as const;

	return {
		to: "/$organizationSlug",
		params: { organizationSlug: org.slug },
	} as const;
}
