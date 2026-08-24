import { sql } from "drizzle-orm";
import { member } from "./schema/organizationSchema";

/** better-auth stores a member's roles in one comma separated column. */
export const parseMemberRoles = (role: string) =>
	role.split(",").map((r) => r.trim());

/** SQL counterpart of {@link parseMemberRoles} for filtering on the column. */
export const memberHasRole = (role: string) =>
	sql`${role} = ANY(string_to_array(replace(${member.role}, ' ', ''), ','))`;
