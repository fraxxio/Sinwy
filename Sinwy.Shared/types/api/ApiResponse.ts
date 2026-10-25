export type ApiResponse<T = unknown> =
	| { isSuccess: true; data: T; message: string | null; code: number }
	| { isSuccess: false; data: null; message: string; code: number };

/** `code` defaults to the HTTP status; these tell apart failures that need their own handling. */
export const API_ERROR_CODES = {
	PLAN_UPGRADE_REQUIRED: 4021,
	ORGANIZATION_INACTIVE: 4091,
	ORDER_NOT_PAID: 4092,
	ORGANIZATION_SUSPENDED: 4093,
	ORGANIZATION_NOT_SUSPENDED: 4094,
	SUSPENSION_PENDING: 4095,
	SUSPENSION_NOT_PENDING: 4096,
	CANCELLATION_PENDING: 4097,
	SUBSCRIPTION_TRIALING: 4098,
	SUBSCRIPTION_PAST_DUE: 4099,
	RESUME_PAYMENT_FAILED: 4022,
	TRANSFER_PENDING: 40910,
} as const;
