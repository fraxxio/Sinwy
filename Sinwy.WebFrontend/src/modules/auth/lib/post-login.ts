import type { OrganizationSummary } from "@sinwy/shared";
import { isNeverPaid, isOrganizationOpen } from "#/shared/lib/organizations";

/**
 * Where a signed-in user lands after login: the session's organization if it
 * can be opened, else the newest one that can → Organization Mode. With none
 * open, an owner whose organization never got paid goes back to its plan page
 * (the payment funnel must stay reachable); everyone else → Customer Mode,
 * where Account → Organizations lists what can be renewed. Unfinished
 * onboarding is not routed here — `UnfinishedOnboardingToast` prompts for it
 * from the root on every route outside the funnel. No-session is handled by
 * the route guard, not here.
 */
export function postLoginDestination(
	organizations: OrganizationSummary[],
	activeOrgId: string | null | undefined,
) {
	const open = organizations.filter(isOrganizationOpen);
	const org = open.find((o) => o.id === activeOrgId) ?? open.at(-1);
	if (org)
		return {
			to: "/$organizationSlug",
			params: { organizationSlug: org.slug },
		} as const;

	const unpaid = organizations
		.filter((o) => o.isOwner && o.deletesAt === null && isNeverPaid(o))
		.at(-1);
	if (unpaid)
		return {
			to: "/organizations/$id/plan",
			params: { id: unpaid.id },
		} as const;

	return { to: "/account" } as const;
}
