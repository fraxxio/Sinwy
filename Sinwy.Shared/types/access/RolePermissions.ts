import type { OrgRole } from "./OrgRole";
import { PERMISSIONS, type Permission } from "./Permission";

// Written out per role so the matrix reads at a glance and tests can pin it.
export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
	owner: [...PERMISSIONS],
	admin: [
		"bookings:read",
		"bookings:write",
		"services:read",
		"services:write",
		"customers:read",
		"customers:write",
		"pages:read",
		"pages:write",
		"payments:read",
		"analytics:read",
		"people:manage",
		"settings:manage",
	],
	staff: [
		"bookings:read",
		"bookings:write",
		"customers:read",
		"customers:write",
		"services:read",
		"pages:read",
	],
};

/** union over all held roles; empty roles → false */
export const hasPermission = (
	roles: readonly OrgRole[],
	permission: Permission,
): boolean =>
	roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission) ?? false);

export const permissionsOf = (roles: readonly OrgRole[]): Set<Permission> =>
	new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []));
