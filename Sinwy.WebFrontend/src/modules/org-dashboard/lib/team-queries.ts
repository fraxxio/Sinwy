import { type InviteRole, parseMemberRoles, primaryRole } from "@sinwy/shared";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type {
	TeamInvitation,
	TeamMember,
} from "#/modules/org-dashboard/lib/team";
import { authClient } from "#/shared/lib/auth/auth-client";
import { authErrorMessage } from "#/shared/lib/auth/auth-error";
import { memberAccessQuery } from "#/shared/lib/auth/permissions";

export const teamKeys = {
	all: (organizationId: string) => ["team", organizationId] as const,
	members: (organizationId: string) =>
		["team", organizationId, "members"] as const,
	invitations: (organizationId: string) =>
		["team", organizationId, "invitations"] as const,
};

type AuthResult<T> = {
	data: T | null;
	error: {
		code?: string | undefined;
		message?: string | undefined;
		status?: number | undefined;
	} | null;
};

const unwrap = <T>({ data, error }: AuthResult<T>): T => {
	if (error) throw new Error(authErrorMessage(error));
	if (data === null) throw new Error(authErrorMessage({}));
	return data;
};

const toIso = (date: Date | string) => new Date(date).toISOString();

export const membersQuery = (organizationId: string) =>
	queryOptions({
		queryKey: teamKeys.members(organizationId),
		queryFn: async (): Promise<TeamMember[]> => {
			const { members } = unwrap(
				await authClient.organization.listMembers({
					query: { organizationId },
				}),
			);
			return members.map((member) => ({
				id: member.id,
				userId: member.userId,
				name: member.user.name,
				email: member.user.email,
				role: primaryRole(parseMemberRoles(member.role)),
				joinedAt: toIso(member.createdAt),
			}));
		},
	});

export const invitationsQuery = (organizationId: string) =>
	queryOptions({
		queryKey: teamKeys.invitations(organizationId),
		queryFn: async (): Promise<TeamInvitation[]> => {
			const invitations = unwrap(
				await authClient.organization.listInvitations({
					query: { organizationId },
				}),
			);
			return invitations.map((invitation) => ({
				id: invitation.id,
				email: invitation.email,
				role: invitation.role,
				status: invitation.status,
				expiresAt: toIso(invitation.expiresAt),
			}));
		},
	});

/** Members, invitations and the caller's own access may all have moved. */
export const invalidateTeam = (
	queryClient: QueryClient,
	organizationId: string,
) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: teamKeys.all(organizationId) }),
		queryClient.invalidateQueries({
			queryKey: memberAccessQuery(organizationId).queryKey,
		}),
	]);

export const inviteMember = async (
	organizationId: string,
	body: { email: string; role: InviteRole; resend?: boolean },
) =>
	unwrap(
		await authClient.organization.inviteMember({ ...body, organizationId }),
	);

export const cancelInvitation = async (invitationId: string) =>
	unwrap(await authClient.organization.cancelInvitation({ invitationId }));

export const updateMemberRole = async (
	organizationId: string,
	memberId: string,
	role: InviteRole,
) =>
	unwrap(
		await authClient.organization.updateMemberRole({
			organizationId,
			memberId,
			role,
		}),
	);

export const removeMember = async (organizationId: string, memberId: string) =>
	unwrap(
		await authClient.organization.removeMember({
			organizationId,
			memberIdOrEmail: memberId,
		}),
	);
