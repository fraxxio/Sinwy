export const ORG_ROLES = ["owner", "admin", "staff"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

const isOrgRole = (value: string): value is OrgRole =>
	(ORG_ROLES as readonly string[]).includes(value);

/** null for anything not in ORG_ROLES, callers treat that as no access */
export const toOrgRole = (value: string): OrgRole | null =>
	isOrgRole(value) ? value : null;

/**
 * better-auth stores several roles in one comma separated column and splits
 * it without trimming; we match that exactly so both readers agree.
 * Unknown names (including " admin") are dropped.
 */
export const parseMemberRoles = (role: string): OrgRole[] =>
	role.split(",").filter(isOrgRole);
