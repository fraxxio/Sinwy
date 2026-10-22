import {
	type Feature,
	hasFeature,
	type OrganizationStatus,
	type PlanSlug,
	toOrganizationStatus,
	toPlanSlug,
} from "@sinwy/shared";
import { useRouteContext } from "@tanstack/react-router";

export type Entitlements = {
	status: OrganizationStatus;
	plan: PlanSlug | null;
};

/** Only an active organization has a plan, as the database enforces. */
export const toEntitlements = (organization: {
	status: string;
	plan?: string | null;
}): Entitlements => {
	const status = toOrganizationStatus(organization.status);
	return {
		status,
		plan: status === "active" ? toPlanSlug(organization.plan ?? null) : null,
	};
};

const INACTIVE: Entitlements = { status: "inactive", plan: null };

/**
 * What the organization in the shell is paying for. Outside it (account
 * dashboard, funnel) the organization is entitled to nothing.
 */
export function useEntitlements() {
	const entitlements = useRouteContext({
		strict: false,
		select: (context) => context.entitlements ?? INACTIVE,
	});
	return {
		status: entitlements.status,
		plan: entitlements.plan,
		isActive: entitlements.status === "active",
		has: (feature: Feature) => hasFeature(entitlements.plan, feature),
	};
}
