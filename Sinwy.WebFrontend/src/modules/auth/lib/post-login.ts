/**
 * Where a signed-in user lands after login: active (or most recent) org →
 * Organization Mode. Which page depends on how far that organization got —
 * unpaid goes back to the plan page (the payment funnel must stay reachable),
 * paid but unfinished setup to onboarding, and a finished one to its
 * dashboard. No orgs → Customer Mode. No-session is handled by the route
 * guard, not here.
 */
export function postLoginDestination(
	organizations: {
		id: string;
		slug: string;
		status: string;
		onboardingCompletedAt?: Date | string | null;
	}[],
	activeOrgId: string | null | undefined,
) {
	const org =
		organizations.find((o) => o.id === activeOrgId) ?? organizations.at(-1);
	if (!org) return { to: "/" } as const;
	if (org.status !== "active")
		return { to: "/organizations/$id/plan", params: { id: org.id } } as const;

	return org.onboardingCompletedAt
		? ({
				to: "/$organizationSlug/home",
				params: { organizationSlug: org.slug },
			} as const)
		: ({
				to: "/organizations/$id/onboarding",
				params: { id: org.id },
			} as const);
}
