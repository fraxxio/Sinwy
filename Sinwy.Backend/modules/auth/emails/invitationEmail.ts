import type { EmailTemplate } from "@backend/infrastructure/email";
import { INVITATION_EXPIRY_DAYS } from "@sinwy/shared";

const escapeHtml = Bun.escapeHTML;

export const InvitationEmail: EmailTemplate<{
	organizationName: string;
	inviterName: string;
	role: string;
	inviteUrl: string;
}> = {
	subject: ({ organizationName }) =>
		`You're invited to join ${organizationName}`,
	html: ({ organizationName, inviterName, role, inviteUrl }) =>
		`<p>${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(organizationName)}</strong> as ${escapeHtml(role)}.</p>
<p><a href="${escapeHtml(inviteUrl)}">Open the invitation</a> to accept it. The link works for ${INVITATION_EXPIRY_DAYS} days.</p>
<p>If you weren't expecting this, you can ignore this email.</p>`,
};
