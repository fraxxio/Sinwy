import { fail } from "@backend/lib/app/respond";
import type { IReqContext, Middleware } from "@backend/lib/app/types";
import { createLogger } from "@logger";
import {
	hasPermission,
	type OrganizationStatus,
	type OrgRole,
	type Permission,
	type PlanSlug,
	parseMemberRoles,
	toOrganizationStatus,
	toPlanSlug,
} from "@sinwy/shared";
import { sessionFrom } from "./middleware";
import { findMembership } from "./repository";

const permissionLogger = createLogger("auth:permission");

export type Membership = {
	organizationId: string;
	roles: OrgRole[];
	status: OrganizationStatus;
	plan: PlanSlug | null;
};

export const ORGANIZATION_PARAM = "organizationId";

export const organizationPath = (suffix: string) =>
	`/api/organizations/:${ORGANIZATION_PARAM}/${suffix}`;

/** null when the user is not a member of the organization. */
export const resolveMembership = async (
	userId: string,
	organizationId: string,
): Promise<Membership | null> => {
	const found = await findMembership(userId, organizationId);
	if (!found) return null;

	const roles = parseMemberRoles(found.role);
	if (roles.length === 0)
		permissionLogger.warn("Member row has no recognised role", {
			userId,
			organizationId,
			role: found.role,
		});
	const plan = toPlanSlug(found.plan);
	if (found.plan !== null && !plan)
		permissionLogger.warn("Organization has an unknown stored plan", {
			organizationId,
			plan: found.plan,
		});
	return {
		organizationId,
		roles,
		status: toOrganizationStatus(found.status),
		plan,
	};
};

/**
 * Scopes the request to one organization (route param first, then the
 * session's active organization) and requires the caller to be a member.
 * Non-member → 404. Resolved once per request, so guards can be stacked.
 */
export const requireMember: Middleware = async (ctx, next) => {
	if (ctx.get("membership")) return next();

	const session = sessionFrom(ctx);
	const params = ctx.req.params as Record<string, string | undefined>;
	const organizationId =
		params[ORGANIZATION_PARAM] ?? session.session.activeOrganizationId;
	if (!organizationId) return fail("No organization in scope", 400);

	const membership = await resolveMembership(session.user.id, organizationId);
	if (!membership) return fail("Not found", 404);

	ctx.set("membership", membership);
	return next();
};

/** `requireMember` plus a role check: member without the permission → 403. */
export const requirePermission =
	(permission: Permission): Middleware =>
	(ctx, next) =>
		requireMember(ctx, () =>
			hasPermission(membershipFrom(ctx).roles, permission)
				? next()
				: Promise.resolve(fail("You don't have permission to do that", 403)),
		);

export const membershipFrom = (ctx: IReqContext): Membership => {
	const membership = ctx.get("membership");
	if (!membership)
		throw new Error("Route is missing the requireMember middleware");
	return membership;
};
