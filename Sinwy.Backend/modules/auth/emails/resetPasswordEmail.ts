import type { EmailTemplate } from "@backend/infrastructure/email";

export const ResetPasswordEmail: EmailTemplate<{ resetUrl: string }> = {
	subject: () => "Reset your password",
	html: ({ resetUrl }) =>
		`<p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
};
