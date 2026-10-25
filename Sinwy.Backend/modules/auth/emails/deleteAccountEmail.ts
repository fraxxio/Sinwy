import type { EmailTemplate } from "@backend/infrastructure/email";
import { ORGANIZATION_RETENTION_DAYS } from "@sinwy/shared";

export const DeleteAccountEmail: EmailTemplate<{ deleteUrl: string }> = {
	subject: () => "Confirm account deletion",
	html: ({ deleteUrl }) =>
		`<p>Click <a href="${deleteUrl}">here</a> to permanently delete your account.</p>
<p>This cannot be undone. Any organization you own loses its subscription and goes offline right away, and is deleted for good after ${ORGANIZATION_RETENTION_DAYS} days.</p>
<p>If you did not request this, you can ignore this email.</p>`,
};
