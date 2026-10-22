import {
	API_ERROR_CODES,
	type ApiResponse,
	hasPermission,
	type OrgRole,
	type Permission,
} from "@sinwy/shared";

// listed, not derived from names, so a new permission starts off while inactive
const ALLOWED_WHILE_INACTIVE: ReadonlySet<Permission> = new Set([
	"bookings:read",
	"services:read",
	"customers:read",
	"pages:read",
	"payments:read",
	"analytics:read",
	"billing:manage",
]);

/** While inactive only reads and billing management remain; every other action is off. */
export const isAllowedWhileInactive = (permission: Permission) =>
	ALLOWED_WHILE_INACTIVE.has(permission);

/** Role check plus read-only mode; what mutation controls are enabled by. */
export const canActWith = (
	roles: readonly OrgRole[],
	isActive: boolean,
	permission: Permission,
) =>
	hasPermission(roles, permission) &&
	(isActive || isAllowedWhileInactive(permission));

/** The API refused a write because the organization has no active plan. */
export const isOrganizationInactive = (res: ApiResponse<unknown>) =>
	!res.isSuccess && res.code === API_ERROR_CODES.ORGANIZATION_INACTIVE;
