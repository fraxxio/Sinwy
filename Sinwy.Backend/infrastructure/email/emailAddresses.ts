/** Local parts of sender addresses. The domain comes from RESEND_EMAIL_DOMAIN. */
export const EmailAddress = {
	Default: "hello",
	NoReply: "noreply",
	Support: "support",
} as const;

export type EmailAddress = (typeof EmailAddress)[keyof typeof EmailAddress];
