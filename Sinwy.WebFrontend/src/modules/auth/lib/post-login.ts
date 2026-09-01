/**
 * Where a signed-in user lands after login: active (or most recent) org →
 * Organization Mode. An unpaid organization goes back to the plan page (the
 * payment funnel must stay reachable). No orgs → Customer Mode. Unfinished
 * onboarding is not routed here — `UnfinishedOnboardingToast` prompts for it
 * from the root on every route outside the funnel. No-session is handled by
 * the route guard, not here.
 */
export function postLoginDestination(
	organizations: { id: string; slug: string; status: string }[],
	activeOrgId: string | null | undefined,
) {
	const org =
		organizations.find((o) => o.id === activeOrgId) ?? organizations.at(-1);
	if (!org) return { to: "/account" } as const;
	if (org.status !== "active")
		return { to: "/organizations/$id/plan", params: { id: org.id } } as const;

	return {
		to: "/$organizationSlug",
		params: { organizationSlug: org.slug },
	} as const;
}
