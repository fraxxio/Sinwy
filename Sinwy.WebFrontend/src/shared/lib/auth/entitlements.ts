import type {
	Feature,
	OrganizationStatus,
	OrganizationSummary,
	PlanSlug,
} from "@sinwy/shared";
import { useRouteContext } from "@tanstack/react-router";

export type Entitlements = {
	status: OrganizationStatus;
	/** The tier's name, for the owner and admins only. */
	plan: PlanSlug | null;
	features: readonly Feature[];
};

const INACTIVE: Entitlements = { status: "inactive", plan: null, features: [] };

/** Only an active organization is entitled to anything; an unknown one to nothing. */
export const toEntitlements = (
	organization:
		| Pick<OrganizationSummary, "status" | "plan" | "features">
		| undefined,
): Entitlements =>
	organization?.status === "active"
		? {
				status: "active",
				plan: organization.plan,
				features: organization.features,
			}
		: INACTIVE;

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
		has: (feature: Feature) => entitlements.features.includes(feature),
	};
}
