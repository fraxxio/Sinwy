// backend rate-limit window for /send-verification-email and frontend resend cooldown
export const RESEND_COOLDOWN_SECONDS = 60;

export type AuthResponse = {
	result: string;
	code: number;
};

/** `code` on Better Auth errors the frontend handles on its own. */
export const AUTH_ERROR_CODES = {
	ORGANIZATION_INACTIVE: "ORGANIZATION_INACTIVE",
} as const;
