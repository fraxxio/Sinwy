import { limitsFor, type OrgRole, type PlanSlug } from "@sinwy/shared";

export type TeamMember = {
	id: string;
	userId: string;
	name: string;
	email: string;
	role: OrgRole;
	joinedAt: string;
};

export type TeamInvitation = {
	id: string;
	email: string;
	role: string;
	status: string;
	expiresAt: string;
};

/** Invitations that still hold a seat; expired ones keep `pending` in the database. */
export const openInvitations = (
	invitations: readonly TeamInvitation[],
	now = new Date(),
) =>
	invitations.filter(
		(invitation) =>
			invitation.status === "pending" && new Date(invitation.expiresAt) > now,
	);

/** Members plus open invitations against the plan's cap, as the backend counts them. */
export const seatUsage = (
	members: readonly TeamMember[],
	invitations: readonly TeamInvitation[],
	plan: PlanSlug | null,
	now = new Date(),
) => {
	const used = members.length + openInvitations(invitations, now).length;
	const limit = limitsFor(plan).members;
	return { used, limit, full: used >= limit };
};

/** Nobody changes or removes the owner, or themselves, from the team page. */
export const canManageMember = (member: TeamMember, currentUserId: string) =>
	member.role !== "owner" && member.userId !== currentUserId;
