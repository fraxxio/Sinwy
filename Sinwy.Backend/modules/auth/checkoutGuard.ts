import { getOrganizationStatus } from "@organizationsModule";
import { APIError } from "better-auth/api";

/**
 * Guards POST /checkout: the caller must be a member of the org the
 * checkout references, and an already-active org can't be re-purchased.
 */
export const ensureCheckoutAllowed = async (
	userId: string,
	organizationId: string,
) => {
	const status = await getOrganizationStatus(userId, organizationId);
	if (status === null)
		throw new APIError("FORBIDDEN", {
			message: "Not a member of this organization",
		});
	if (status === "active")
		throw new APIError("BAD_REQUEST", {
			message: "Organization is already active",
		});
};
