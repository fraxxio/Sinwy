import type { PaymentStatus } from "@sinwy/shared";

export const receiptNumberOf = (paymentId: string) =>
	paymentId.slice(0, 8).toUpperCase();

export const receiptHeadingOf = (status: PaymentStatus) => {
	if (status === "paid") return "Receipt";
	if (status === "pending") return "Payment summary · Not paid yet";
	return "Payment summary";
};
