/** `refunded` is reserved for refunds; nothing sets it yet. */
export const PAYMENT_STATUSES = [
	"pending",
	"paid",
	"void",
	"refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ["manual"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
