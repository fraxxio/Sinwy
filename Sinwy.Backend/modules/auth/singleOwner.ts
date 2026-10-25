import { parseMemberRoles } from "@sinwy/shared";
import { APIError } from "better-auth/api";

/**
 * An organization has exactly one owner, whose Polar customer pays for it.
 * Ownership moves only through a transfer, which swaps the roles together
 * with the subscription; never through invitations or role changes.
 */
export const refuseOwnerRole = (...roles: string[]) => {
	if (roles.some((role) => parseMemberRoles(role).includes("owner")))
		throw new APIError("FORBIDDEN", {
			message:
				"An organization has one owner; ownership can't be given or changed",
		});
};
