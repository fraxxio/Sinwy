export type ApiResponse<T = unknown> =
	| { isSuccess: true; data: T; message: string | null; code: number }
	| { isSuccess: false; data: null; message: string; code: number };

/** `code` defaults to the HTTP status; these tell apart failures that need their own handling. */
export const API_ERROR_CODES = {
	PLAN_UPGRADE_REQUIRED: 4021,
	ORGANIZATION_INACTIVE: 4091,
	ORDER_NOT_PAID: 4092,
} as const;
