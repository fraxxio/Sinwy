import {
	hasPermission,
	type OrgRole,
	type Permission,
	parseMemberRoles,
} from "@sinwy/shared";
import { useRouteContext } from "@tanstack/react-router";
import { authClient } from "#/shared/lib/auth/auth-client";

export type MemberAccess = { roles: OrgRole[] };

/** What every route under the org shell can rely on in its context. */
export type OrgRouteContext = {
	organization: { slug: string };
	member: MemberAccess;
};

export const memberAccessQuery = (organizationId: string) => ({
	queryKey: ["organizations", organizationId, "member"] as const,
	queryFn: async (): Promise<MemberAccess> => {
		const { data, error } = await authClient.organization.getActiveMemberRole({
			query: { organizationId },
		});
		if (error || !data) throw new Error(error?.message ?? "Not a member");
		return { roles: parseMemberRoles(data.role) };
	},
	staleTime: 60_000,
});

const NO_ROLES: OrgRole[] = [];

/**
 * Roles of the signed-in member in the organization shell. Outside it
 * (account dashboard, funnel) roles are empty and `can` is always false.
 */
export function usePermissions() {
	const roles = useRouteContext({
		strict: false,
		select: (context) => context.member?.roles ?? NO_ROLES,
	});
	return {
		roles,
		can: (permission: Permission) => hasPermission(roles, permission),
	};
}
