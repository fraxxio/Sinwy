export const ORG_ROLES = ["owner", "admin", "staff"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

const isOrgRole = (value: string): value is OrgRole =>
	(ORG_ROLES as readonly string[]).includes(value);

/** null for anything not in ORG_ROLES, callers treat that as no access */
export const toOrgRole = (value: string): OrgRole | null =>
	isOrgRole(value) ? value : null;

/** better-auth stores several roles in one comma separated column; unknown names are dropped */
export const parseMemberRoles = (role: string): OrgRole[] =>
	role
		.split(",")
		.map((r) => r.trim())
		.filter(isOrgRole);
