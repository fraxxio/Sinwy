import { z } from "zod";
import { INVITE_ROLES } from "../access/OrgRole";

export const INVITATION_EXPIRY_DAYS = 7;

/** `unavailable` is the 404: unknown, canceled, rejected, accepted or the organization is closing. */
export const INVITATION_PREVIEW_STATUSES = [
	"pending",
	"expired",
	"unavailable",
] as const;

export type InvitationPreviewStatus =
	(typeof INVITATION_PREVIEW_STATUSES)[number];

/** What anyone holding the invite link may see, signed in or not. */
export const invitationPreviewSchema = z.object({
	status: z.enum(["pending", "expired"]),
	organization: z.object({ name: z.string(), slug: z.string() }),
	inviterName: z.string(),
	role: z.enum(INVITE_ROLES),
	email: z.string(),
	expiresAt: z.string(),
});

export type InvitationPreviewDto = z.infer<typeof invitationPreviewSchema>;
