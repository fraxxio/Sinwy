import { fail } from "@backend/lib/app/respond";
import type { IReqContext, Middleware } from "@backend/lib/app/types";
import { createLogger } from "@logger";
import {
	hasPermission,
	type OrgRole,
	type Permission,
	parseMemberRoles,
} from "@sinwy/shared";
import { sessionFrom } from "./middleware";
import { findMemberRole } from "./repository";

const permissionLogger = createLogger("auth:permission");

export type Membership = {
	organizationId: string;
	roles: OrgRole[];
};

/**
 * Scopes the request to one organization (route param first, then the
 * session's active organization) and checks the caller's roles against it.
 * Non-member → 404, member without the permission → 403.
 */
export const requirePermission =
	(permission: Permission): Middleware =>
	async (ctx, next) => {
		const session = sessionFrom(ctx);
		const params = ctx.req.params as Record<string, string | undefined>;
		const organizationId =
			params["organizationId"] ?? session.session.activeOrganizationId;
		if (!organizationId) return fail("No organization in scope", 400);

		const role = await findMemberRole(session.user.id, organizationId);
		if (role === null) return fail("Not found", 404);

		const roles = parseMemberRoles(role);
		if (roles.length === 0)
			permissionLogger.warn("Member row has no recognised role", {
				userId: session.user.id,
				organizationId,
				role,
			});
		if (!hasPermission(roles, permission))
			return fail("You don't have permission to do that", 403);

		ctx.set("membership", { organizationId, roles });
		return next();
	};

export const membershipFrom = (ctx: IReqContext): Membership => {
	const membership = ctx.get("membership");
	if (!membership)
		throw new Error("Route is missing the requirePermission middleware");
	return membership;
};
