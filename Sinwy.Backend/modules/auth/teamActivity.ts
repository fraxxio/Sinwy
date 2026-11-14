import { createLogger } from "@logger";
import {
	type ActivityActor,
	getUserName,
	recordActivity,
} from "@organizationsModule";
import { INVITE_ROLES, parseMemberRoles } from "@sinwy/shared";
import { isAPIError } from "better-auth/api";
import { z } from "zod";

const logger = createLogger("auth:team-activity");

const withRole = z.object({ organizationId: z.string(), role: z.string() });
const member = withRole.extend({ userId: z.string() });
const removed = z.object({
	member: member.extend({ user: z.object({ name: z.string() }).optional() }),
});

const inviteRoleOf = (role: string) => {
	const roles = parseMemberRoles(role);
	return INVITE_ROLES.find((candidate) => roles.includes(candidate));
};

const nameOf = async (userId: string, known?: string) =>
	known ?? (await getUserName(userId)) ?? "";

const record = async (
	path: string,
	actor: ActivityActor,
	returned: unknown,
) => {
	if (isAPIError(returned)) return;
	switch (path) {
		case "/organization/invite-member":
		case "/organization/cancel-invitation": {
			const parsed = withRole.safeParse(returned);
			const role = parsed.success && inviteRoleOf(parsed.data.role);
			if (!parsed.success || !role) return;
			return recordActivity(parsed.data.organizationId, actor, {
				action:
					path === "/organization/invite-member"
						? "member.invited"
						: "invitation.revoked",
				details: { role },
			});
		}
		case "/organization/update-member-role": {
			const parsed = member.safeParse(returned);
			const role = parsed.success && inviteRoleOf(parsed.data.role);
			if (!parsed.success || !role) return;
			return recordActivity(parsed.data.organizationId, actor, {
				action: "member.role_changed",
				details: { memberName: await nameOf(parsed.data.userId), role },
			});
		}
		case "/organization/remove-member": {
			const parsed = removed.safeParse(returned);
			if (!parsed.success) return;
			const { organizationId, userId, user } = parsed.data.member;
			return recordActivity(organizationId, actor, {
				action: "member.removed",
				details: { memberName: await nameOf(userId, user?.name) },
			});
		}
		case "/organization/leave": {
			const parsed = member.safeParse(returned);
			if (!parsed.success) return;
			return recordActivity(parsed.data.organizationId, actor, {
				action: "member.left",
				details: {},
			});
		}
	}
};

/**
 * Records what a better-auth team endpoint did, from what it returned. A
 * refused call returns an APIError, which none of these shapes match. Best
 * effort: the change has committed, so a failure is logged and never thrown.
 */
export const recordTeamActivity = async (
	path: string,
	actor: ActivityActor,
	returned: unknown,
) => {
	try {
		await record(path, actor, returned);
	} catch (error) {
		logger.error("Failed to record team activity", { path, error });
	}
};
