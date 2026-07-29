// backend rate-limit window for /send-verification-email and frontend resend cooldown
export const RESEND_COOLDOWN_SECONDS = 60;

export type AuthResponse = {
	result: string;
	code: number;
};
