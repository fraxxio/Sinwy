export const INVOICE_STATUSES = [
	"draft",
	"pending",
	"paid",
	"refunded",
	"partially_refunded",
	"void",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_BILLING_REASONS = [
	"purchase",
	"subscription_create",
	"subscription_cycle",
	"subscription_update",
] as const;

export type InvoiceBillingReason = (typeof INVOICE_BILLING_REASONS)[number];

export type InvoiceDto = {
	id: string;
	/** null until Polar numbers the order. */
	number: string | null;
	createdAt: string;
	/** null when Polar sent a status this version doesn't know. */
	status: InvoiceStatus | null;
	/** Integer minor units. */
	totalAmount: number;
	currency: string;
	billingReason: InvoiceBillingReason | null;
	/** False until someone first downloads it; the download endpoint generates it. */
	invoiceGenerated: boolean;
};

export type InvoiceListDto = {
	items: InvoiceDto[];
	page: number;
	limit: number;
	total: number;
};

/** Short-lived presigned URL; fetch it on click, never store it. */
export type InvoiceDownloadDto = { url: string };
