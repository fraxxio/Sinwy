import {
	getInvitationOrganizationId,
	getMembershipAccess,
	isOrganizationPublic,
	isScheduledForDeletion,
} from "@organizationsModule";
import {
	AUTH_ERROR_CODES,
	hasPermission,
	type Permission,
	parseMemberRoles,
} from "@sinwy/shared";
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

type ScopeKey = "organizationSlug" | "organizationId" | "invitationId";

type ScopedEndpoint = {
	input: "query" | "body";
	/** The keys the plugin itself reads the organization from; the first one set wins. */
	reads: readonly ScopeKey[];
	manages: boolean;
	permission?: Permission;
};

const TEAM_PERMISSION: Permission = "people:manage";

const SLUG_OR_ID = ["organizationSlug", "organizationId"] as const;
const ID = ["organizationId"] as const;

/**
 * Plugin endpoints that act on one organization, and where each reads it
 * from. Leaving is the member's own choice, so it doesn't manage; deleting is
 * the owner's (the plugin's own check), active or not.
 */
const scopedEndpoints: Record<string, ScopedEndpoint> = {
	"/organization/get-organization": {
		input: "query",
		reads: SLUG_OR_ID,
		manages: false,
	},
	"/organization/get-full-organization": {
		input: "query",
		reads: SLUG_OR_ID,
		manages: false,
	},
	"/organization/list-members": {
		input: "query",
		reads: SLUG_OR_ID,
		manages: false,
		permission: TEAM_PERMISSION,
	},
	"/organization/list-invitations": {
		input: "query",
		reads: ID,
		manages: false,
		permission: TEAM_PERMISSION,
	},
	"/organization/get-active-member": {
		input: "query",
		reads: [],
		manages: false,
	},
	"/organization/get-active-member-role": {
		input: "query",
		reads: SLUG_OR_ID,
		manages: false,
	},
	"/organization/has-permission": { input: "body", reads: ID, manages: false },
	"/organization/leave": { input: "body", reads: ID, manages: false },
	"/organization/delete": { input: "body", reads: ID, manages: false },
	"/organization/invite-member": { input: "body", reads: ID, manages: true },
	"/organization/cancel-invitation": {
		input: "body",
		reads: ["invitationId"],
		manages: true,
	},
	"/organization/remove-member": { input: "body", reads: ID, manages: true },
	"/organization/update-member-role": {
		input: "body",
		reads: ID,
		manages: true,
	},
};

const scopeInput = z.object({
	organizationId: z.string().nullish(),
	organizationSlug: z.string().nullish(),
	invitationId: z.string().nullish(),
});

// resolved the way the plugin resolves it: only from the keys that endpoint
// reads, falling back to the session's active organization. A key the plugin
// ignores must not pick the organization that gets checked.
const scopedOrganization = async (
	endpoint: ScopedEndpoint,
	input: unknown,
	activeOrganizationId: string | null | undefined,
) => {
	const parsed = scopeInput.safeParse(input ?? {});
	if (!parsed.success) return null;
	const key = endpoint.reads.find((candidate) => parsed.data[candidate]);
	const value = key && parsed.data[key];
	if (!value) return activeOrganizationId ? { id: activeOrganizationId } : null;
	if (key === "organizationSlug") return { slug: value };
	const id =
		key === "invitationId" ? await getInvitationOrganizationId(value) : value;
	return id ? { id } : null;
};

/**
 * The plugin checks membership only. Nobody reaches an organization scheduled
 * for deletion through it, nobody manages an inactive one, and only those who
 * manage people read the team. A non-member is left to the plugin's own refusal.
 */
export const refuseOrganizationEndpoint = async (
	path: string,
	session: { userId: string; activeOrganizationId?: string | null },
	request: { body?: unknown; query?: unknown },
) => {
	const endpoint = scopedEndpoints[path];
	if (!endpoint) return;
	const ref = await scopedOrganization(
		endpoint,
		request[endpoint.input],
		session.activeOrganizationId,
	);
	if (!ref) return;
	const org = await getMembershipAccess(session.userId, ref);
	if (!org) return;
	if (org.deletionScheduledAt) throw scheduledError();
	if (
		endpoint.permission &&
		!hasPermission(parseMemberRoles(org.role), endpoint.permission)
	)
		throw new APIError("FORBIDDEN", {
			message: "You don't have permission to do that",
		});
	if (endpoint.manages && !isOrganizationPublic(org))
		throw new APIError("FORBIDDEN", {
			message: "This organization isn't active",
			code: AUTH_ERROR_CODES.ORGANIZATION_INACTIVE,
		});
};

const fullOrganization = z.looseObject({ id: z.string() });

/**
 * The plugin's full organization carries every member and invitation; anyone
 * who doesn't manage people gets it without them.
 */
export const withoutTeamUnlessManager = async (
	userId: string,
	returned: unknown,
) => {
	const parsed = fullOrganization.safeParse(returned);
	if (!parsed.success) return null;
	const org = await getMembershipAccess(userId, { id: parsed.data.id });
	if (org && hasPermission(parseMemberRoles(org.role), TEAM_PERMISSION))
		return null;
	return { ...parsed.data, members: [], invitations: [] };
};
