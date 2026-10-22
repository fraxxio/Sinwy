import { parseMemberRoles } from "@sinwy/shared";
import { APIError } from "better-auth/api";

/**
 * An organization has exactly one owner, its creator, and ownership never
 * moves: it's the owner's Polar customer that pays for the organization.
 */
export const refuseOwnerRole = (...roles: string[]) => {
	if (roles.some((role) => parseMemberRoles(role).includes("owner")))
		throw new APIError("FORBIDDEN", {
			message:
				"An organization has one owner; ownership can't be given or changed",
		});
};
