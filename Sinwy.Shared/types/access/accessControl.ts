import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";
import type { OrgRole } from "./OrgRole";
import {
	PERMISSION_STATEMENTS,
	type Permission,
	type PermissionAction,
	type PermissionResource,
	splitPermission,
} from "./Permission";
import { ROLE_PERMISSIONS } from "./RolePermissions";

export const ac = createAccessControl({
	...defaultStatements,
	...PERMISSION_STATEMENTS,
});

type RoleStatements = { [R in PermissionResource]: PermissionAction<R>[] };

// toStatements(["bookings:read", "bookings:write"]) → { bookings: ["read", "write"], services: [], … }
const toStatements = (permissions: readonly Permission[]): RoleStatements => {
	const statements: Record<PermissionResource, string[]> = {
		bookings: [],
		services: [],
		customers: [],
		pages: [],
		payments: [],
		analytics: [],
		team: [],
		billing: [],
		settings: [],
	};
	for (const permission of permissions) {
		const [resource, action] = splitPermission(permission);
		statements[resource].push(action);
	}
	return statements as RoleStatements;
};

// Built-in owner/admin/member statements are kept so better-auth's own
// endpoints (invite, update role, remove member, delete org) keep their
// default semantics per role; staff inherits memberAc.
export const orgAccgssRoles = {
	owner: ac.newRole({
		...ownerAc.statements,
		...toStatements(ROLE_PERMISSIONS.owner),
	}),
	admin: ac.newRole({
		...adminAc.statements,
		...toStatements(ROLE_PERMISSIONS.admin),
	}),
	staff: ac.newRole({
		...memberAc.statements,
		...toStatements(ROLE_PERMISSIONS.staff),
	}),
} satisfies Record<OrgRole, unknown>;
