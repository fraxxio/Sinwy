import type { EmailTemplate } from "@backend/infrastructure/email";

export const VerificationEmail: EmailTemplate<{ verifyUrl: string }> = {
	subject: () => "Verify your email",
	html: ({ verifyUrl }) =>
		`<p>Click <a href="${verifyUrl}">here</a> to verify your email.</p>`,
};
