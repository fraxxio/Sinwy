// Shape is exactly what better-auth's createAccessControl takes; the
// permission list and type below derive from it so the two cannot drift.
export const PERMISSION_STATEMENTS = {
	bookings: ["read", "write"],
	services: ["read", "write"],
	customers: ["read", "write"],
	pages: ["read", "write"],
	payments: ["read"],
	analytics: ["read"],
	people: ["manage"],
	billing: ["manage"],
	settings: ["manage"],
} as const;

export type PermissionResource = keyof typeof PERMISSION_STATEMENTS;

export type PermissionAction<R extends PermissionResource> =
	(typeof PERMISSION_STATEMENTS)[R][number];

export type Permission = {
	[R in PermissionResource]: `${R}:${PermissionAction<R>}`;
}[PermissionResource];

export const PERMISSION_RESOURCES = Object.keys(
	PERMISSION_STATEMENTS,
) as readonly PermissionResource[];

export const PERMISSIONS: readonly Permission[] = PERMISSION_RESOURCES.flatMap(
	(resource) =>
		PERMISSION_STATEMENTS[resource].map(
			(action) => `${resource}:${action}` as Permission,
		),
);

export const splitPermission = (permission: Permission) =>
	permission.split(":") as [PermissionResource, string];
