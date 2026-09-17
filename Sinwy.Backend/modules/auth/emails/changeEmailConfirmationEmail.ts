import type { EmailTemplate } from "@backend/infrastructure/email";

export const ChangeEmailConfirmationEmail: EmailTemplate<{
	newEmail: string;
	confirmUrl: string;
}> = {
	subject: () => "Approve your email change",
	html: ({ newEmail, confirmUrl }) =>
		`<p>You asked to change your email to <strong>${newEmail}</strong>.</p>
<p>Click <a href="${confirmUrl}">here</a> to approve the change. We will then send a verification link to the new address.</p>
<p>If you did not request this, you can ignore this email.</p>`,
};
