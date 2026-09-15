import { getOrganizationStatus } from "@organizationsModule";
import { hasPermission } from "@sinwy/shared";
import { APIError } from "better-auth/api";
import { resolveMembership } from "./requirePermission";

/**
 * Guards POST /checkout: buying a plan is `billing:manage` on the org the
 * checkout references, and an already-active org can't be re-purchased.
 */
export const ensureCheckoutAllowed = async (
	userId: string,
	organizationId: string,
) => {
	const membership = await resolveMembership(userId, organizationId);
	if (!membership)
		throw new APIError("FORBIDDEN", {
			message: "Not a member of this organization",
		});
	if (!hasPermission(membership.roles, "billing:manage"))
		throw new APIError("FORBIDDEN", {
			message: "You don't have permission to buy a plan for this organization",
		});
	if ((await getOrganizationStatus(membership)) === "active")
		throw new APIError("BAD_REQUEST", {
			message: "Organization is already active",
		});
};
