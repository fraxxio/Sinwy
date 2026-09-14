import type { OrgRole } from "@sinwy/shared";
import { sql } from "drizzle-orm";
import { member } from "./schema/organizationSchema";

/** SQL counterpart of parseMemberRoles: matches one role inside better-auth's comma separated column. */
export const memberHasRole = (role: OrgRole) =>
	sql`${role} = ANY(string_to_array(replace(${member.role}, ' ', ''), ','))`;
