import {
	getInvitationOrganizationId,
	getMembershipAccess,
	isOrganizationPublic,
	isScheduledForDeletion,
} from "@organizationsModule";
import { AUTH_ERROR_CODES } from "@sinwy/shared";
import { APIError } from "better-auth/api";
import { z } from "zod";

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
	const org = await getMembershipAccess(session.userId, ref);
	if (org && !isOrganizationPublic(org))
		throw new APIError("FORBIDDEN", {
			message: "This organization isn't available",
			code: AUTH_ERROR_CODES.ORGANIZATION_INACTIVE,
		});
};

const scheduledError = () =>
	new APIError("FORBIDDEN", {
		message: "This organization is scheduled for deletion",
		code: AUTH_ERROR_CODES.ORGANIZATION_INACTIVE,
	});

/** Nobody joins an organization once its owner's account is deleted. */
export const refuseScheduledOrganization = async (organizationId: string) => {
	if (await isScheduledForDeletion(organizationId)) throw scheduledError();
};

type ScopedEndpoint = { input: "query" | "body"; manages: boolean };

/**
 * Plugin endpoints that act on one organization, and where each reads it
 * from. Leaving is the member's own choice, so it doesn't manage.
 */
const scopedEndpoints: Record<string, ScopedEndpoint> = {
	"/organization/get-organization": { input: "query", manages: false },
	"/organization/get-full-organization": { input: "query", manages: false },
	"/organization/list-members": { input: "query", manages: false },
	"/organization/list-invitations": { input: "query", manages: false },
	"/organization/get-active-member": { input: "query", manages: false },
	"/organization/get-active-member-role": { input: "query", manages: false },
	"/organization/has-permission": { input: "body", manages: false },
	"/organization/leave": { input: "body", manages: false },
	"/organization/update": { input: "body", manages: true },
	"/organization/delete": { input: "body", manages: true },
	"/organization/invite-member": { input: "body", manages: true },
	"/organization/cancel-invitation": { input: "body", manages: true },
	"/organization/remove-member": { input: "body", manages: true },
	"/organization/update-member-role": { input: "body", manages: true },
};

const scopeInput = z.object({
	organizationId: z.string().nullish(),
	organizationSlug: z.string().nullish(),
	invitationId: z.string().nullish(),
});

// resolved the way the plugin resolves it: a slug beats the id, and both
// fall back to the session's active organization
const scopedOrganization = async (
	input: unknown,
	activeOrganizationId: string | null | undefined,
) => {
	const parsed = scopeInput.safeParse(input ?? {});
	if (!parsed.success) return null;
	const { organizationId, organizationSlug, invitationId } = parsed.data;
	if (organizationSlug) return { slug: organizationSlug };
	const id = invitationId
		? await getInvitationOrganizationId(invitationId)
		: organizationId || activeOrganizationId;
	return id ? { id } : null;
};

/**
 * The plugin checks membership only. Nobody reaches an organization scheduled
 * for deletion through it, and nobody manages an inactive one. A non-member
 * is left to the plugin's own refusal.
 */
export const refuseOrganizationEndpoint = async (
	path: string,
	session: { userId: string; activeOrganizationId?: string | null },
	request: { body?: unknown; query?: unknown },
) => {
	const endpoint = scopedEndpoints[path];
	if (!endpoint) return;
	const ref = await scopedOrganization(
		request[endpoint.input],
		session.activeOrganizationId,
	);
	if (!ref) return;
	const org = await getMembershipAccess(session.userId, ref);
	if (!org) return;
	if (org.deletionScheduledAt) throw scheduledError();
	if (endpoint.manages && !isOrganizationPublic(org))
		throw new APIError("FORBIDDEN", {
			message: "This organization isn't active",
			code: AUTH_ERROR_CODES.ORGANIZATION_INACTIVE,
		});
};
