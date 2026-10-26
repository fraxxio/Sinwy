import type { OrganizationSummary } from "@sinwy/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { linkOptions } from "@tanstack/react-router";
import { api } from "#/shared/lib/api";
import { formatDay } from "#/shared/lib/date";

const organizationsKey = ["organizations", "list"] as const;

export const organizationsQuery = queryOptions({
	queryKey: organizationsKey,
	queryFn: async () => {
		const res = await api<OrganizationSummary[]>("/organizations");
		if (!res.isSuccess) throw new Error(res.message);
		return res.data;
	},
	staleTime: 30_000,
});

/** After anything that can change an organization's status or plan. */
export const invalidateOrganizations = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({ queryKey: organizationsKey });

/** Finished setup once, so the first-time funnel no longer applies, whatever its billing status. */
export const hasCompletedSetup = (organization: {
	onboardingCompletedAt?: Date | string | null;
}) => Boolean(organization.onboardingCompletedAt);

/** The only organizations anyone can open; the backend refuses the rest. */
export const isOrganizationOpen = (
	organization: Pick<OrganizationSummary, "status" | "deletesAt">,
) => organization.status === "active" && organization.deletesAt === null;

/**
 * Where an organization that can't be opened still leads: its owner to
 * Account → Organizations, to activate it or sort out the plan. Nobody else
 * has anywhere to go, and nobody does once it is scheduled for deletion.
 */
export const reactivationLink = (
	organization: Pick<OrganizationSummary, "isOwner" | "deletesAt">,
) =>
	organization.isOwner && organization.deletesAt === null
		? linkOptions({ to: "/account/organizations" })
		: null;

type ClosedOrganization = Pick<
	OrganizationSummary,
	"deletesAt" | "suspended" | "draft"
>;

/** Why an organization can't be opened, for whoever is turned away from it. */
export const closedOrganizationReason = (organization: ClosedOrganization) =>
	organization.deletesAt
		? `This organization will be deleted on ${formatDay(organization.deletesAt)}`
		: organization.suspended
			? "This organization is suspended"
			: organization.draft
				? "This organization is still a draft"
				: "This organization is inactive";

/** Badge for an organization that can't be opened. */
export const closedOrganizationBadge = (organization: ClosedOrganization) =>
	organization.deletesAt
		? "Scheduled for deletion"
		: organization.suspended
			? "Suspended"
			: organization.draft
				? "Draft"
				: "Inactive";
