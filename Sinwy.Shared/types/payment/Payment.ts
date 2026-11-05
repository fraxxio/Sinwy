import type { PaymentProvider, PaymentStatus } from "./PaymentStatus";

export const PAYMENT_LIMITS = {
	listPageSize: 25,
	listMaxPageSize: 100,
	customerListPageSize: 20,
} as const;

/** A payment as the organization sees it, with its booking's customer, service and start. */
export type PaymentDto = {
	id: string;
	bookingId: string;
	amountMinor: number;
	currency: string;
	status: PaymentStatus;
	provider: PaymentProvider;
	providerRef: string | null;
	paidAt: string | null;
	createdAt: string;
	customerName: string;
	serviceName: string;
	startsAt: string;
};

/** `void` payments are left out; one entry per currency in the range. */
export type PaymentTotalsDto = {
	currency: string;
	paidMinor: number;
	pendingMinor: number;
	count: number;
};

/** `from` and `to` are the resolved org-local range, defaults included. */
export type PaymentListDto = {
	items: PaymentDto[];
	total: number;
	totals: PaymentTotalsDto[];
	from: string;
	to: string;
};

export type CustomerPaymentDto = {
	id: string;
	bookingId: string;
	amountMinor: number;
	currency: string;
	status: PaymentStatus;
	provider: PaymentProvider;
	paidAt: string | null;
	createdAt: string;
	serviceName: string;
	startsAt: string;
	organization: { name: string; slug: string; timezone: string };
};

export type CustomerPaymentListDto = {
	items: CustomerPaymentDto[];
	total: number;
};

export type CustomerPaymentDetailDto = CustomerPaymentDto & {
	customerName: string;
};
