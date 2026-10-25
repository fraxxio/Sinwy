import type { OrganizationSummary } from "@sinwy/shared";
import {
	isOrganizationOpen,
	reactivationLink,
} from "#/shared/lib/organizations";

/**
 * Where a signed-in user lands after login: the session's organization if it
 * can be opened, else the newest one that can → Organization Mode. With none
 * open, an owner of a draft or inactive organization goes to Account →
 * Organizations, which leads on to a plan or a free slot; everyone else →
 * Customer Mode. Unfinished onboarding is not routed here —
 * `UnfinishedOnboardingToast` prompts for it from the root on every route
 * outside the funnel. No-session is handled by the route guard, not here.
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

	const closedOwned = organizations.find((o) => reactivationLink(o) !== null);
	if (closedOwned) return { to: "/account/organizations" } as const;

	return { to: "/account" } as const;
}
