import { hasPermission, type OrgRole, type Permission } from "@sinwy/shared";

/** While inactive only reads and billing management remain; every other action is off. */
export const isAllowedWhileInactive = (permission: Permission) =>
	permission.endsWith(":read") || permission === "billing:manage";

/** Role check plus read-only mode; what mutation controls are enabled by. */
export const canActWith = (
	roles: readonly OrgRole[],
	isActive: boolean,
	permission: Permission,
) =>
	hasPermission(roles, permission) &&
	(isActive || isAllowedWhileInactive(permission));
