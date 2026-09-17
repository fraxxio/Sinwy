import type { EmailTemplate } from "@backend/infrastructure/email";

export const DeleteAccountEmail: EmailTemplate<{ deleteUrl: string }> = {
	subject: () => "Confirm account deletion",
	html: ({ deleteUrl }) =>
		`<p>Click <a href="${deleteUrl}">here</a> to permanently delete your account.</p>
<p>This cannot be undone. Any organization you are the sole owner of will be deleted along with its subscription.</p>
<p>If you did not request this, you can ignore this email.</p>`,
};
