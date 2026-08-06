import type { PostLoginFlags } from "@sinwy/shared";
import { findUnpaidOwnedOrganization } from "./repository";

/**
 * Prompts the frontend should raise after login. Deliberately reads only
 * cached state: this is polled once per app load, so it must never reach for
 * Polar, reconciling billing stays on GET /organizations/:id/status, which
 * runs when the user actually re-enters the funnel.
 */
export const getPostLoginFlags = async (
	userId: string,
): Promise<PostLoginFlags> => {
	const organizationId = await findUnpaidOwnedOrganization(userId);
	return {
		unfinishedOnboarding: organizationId
			? { step: "select-plan", organizationId }
			: null,
	};
};
