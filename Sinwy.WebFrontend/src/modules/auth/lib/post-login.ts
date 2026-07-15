/**
 * Where a signed-in user lands after login: active (or most recent) org →
 * Organization Mode — its onboarding page when paid, the plan page when the
 * org is still inactive (the payment funnel must stay reachable). No orgs →
 * Customer Mode. No-session is handled by the route guard, not here.
 */
export function postLoginDestination(
	organizations: { id: string; status: string }[],
	activeOrgId: string | null | undefined,
) {
	const org =
		organizations.find((o) => o.id === activeOrgId) ?? organizations.at(-1);
	if (!org) return { to: "/" } as const;
	// ponytail: onboarding stands in for the dashboard until one exists
	return org.status === "active"
		? ({ to: "/organizations/$id/onboarding", params: { id: org.id } } as const)
		: ({ to: "/organizations/$id/plan", params: { id: org.id } } as const);
}
