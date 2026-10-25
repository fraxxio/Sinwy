import {
	isOrganizationPublic,
	isScheduledForDeletion,
} from "@organizationsModule";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import { APIError } from "better-auth/api";
import { z } from "zod";
import {
	clearActiveOrganizationFromSessions,
	findMemberOrganization,
} from "./repository";

const setActiveBody = z.object({
	organizationId: z.string().nullish(),
	organizationSlug: z.string().optional(),
});

// resolved the way the plugin resolves it: null leaves, id beats slug, and
// neither re-activates the session's current organization
const requestedOrganization = (
	body: unknown,
	activeOrganizationId: string | null | undefined,
) => {
	const parsed = setActiveBody.safeParse(body);
	if (!parsed.success) return null;
	const { organizationId, organizationSlug } = parsed.data;
	if (organizationId === null) return null;
	if (organizationId) return { id: organizationId };
	if (organizationSlug) return { slug: organizationSlug };
	return activeOrganizationId ? { id: activeOrganizationId } : null;
};

/**
 * Nobody opens an inactive organization or one scheduled for deletion. A
 * non-member is left to the plugin's own refusal, so they learn nothing about
 * the organization.
 */
export const refuseUnavailableOrganization = async (
	session: { userId: string; activeOrganizationId?: string | null },
	body: unknown,
) => {
	const ref = requestedOrganization(body, session.activeOrganizationId);
	if (!ref) return;
	const org = await findMemberOrganization(session.userId, ref);
	if (org && !isOrganizationPublic(org))
		throw new APIError("FORBIDDEN", {
			message: "This organization isn't available",
			code: AUTH_ERROR_CODES.ORGANIZATION_INACTIVE,
		});
};

/** Nobody joins an organization once its owner's account is deleted. */
export const refuseScheduledOrganization = async (organizationId: string) => {
	if (await isScheduledForDeletion(organizationId))
		throw new APIError("FORBIDDEN", {
			message: "This organization is scheduled for deletion",
			code: AUTH_ERROR_CODES.ORGANIZATION_INACTIVE,
		});
};

/** Takes the organization out of every session that has it active. */
export const clearActiveOrganization = async (organizationId: string) => {
	await clearActiveOrganizationFromSessions(organizationId);
};
