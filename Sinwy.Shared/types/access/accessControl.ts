import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";
import type { OrgRole } from "./OrgRole";
import {
	PERMISSION_RESOURCES,
	PERMISSION_STATEMENTS,
	type Permission,
	type PermissionAction,
	type PermissionResource,
	splitPermission,
} from "./Permission";
import { ROLE_PERMISSIONS } from "./RolePermissions";

// Our resources must not shadow better-auth's built-ins (organization,
// member, invitation, team, ac); a collision fails typecheck here.
type Overlap = Extract<keyof typeof defaultStatements, PermissionResource>;
type NoOverlap<T> = Overlap extends never ? T : never;

export const ac = createAccessControl({
	...defaultStatements,
	...(PERMISSION_STATEMENTS satisfies NoOverlap<typeof PERMISSION_STATEMENTS>),
});

type RoleStatements = { [R in PermissionResource]: PermissionAction<R>[] };

// toStatements(["bookings:read", "bookings:write"]) → { bookings: ["read", "write"], services: [], … }
const toStatements = (permissions: readonly Permission[]): RoleStatements => {
	const statements = Object.fromEntries(
		PERMISSION_RESOURCES.map((resource): [PermissionResource, string[]] => [
			resource,
			[],
		]),
	) as Record<PermissionResource, string[]>;
	for (const permission of permissions) {
		const [resource, action] = splitPermission(permission);
		statements[resource].push(action);
	}
	return statements as RoleStatements;
};

// Built-in owner/admin/member statements are kept so better-auth's own
// endpoints (invite, update role, remove member, delete org) keep their
// default semantics per role; staff inherits memberAc.
export const orgAccessRoles = {
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
