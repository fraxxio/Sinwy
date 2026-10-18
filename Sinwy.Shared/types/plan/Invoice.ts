export type InvoiceStatus =
	| "draft"
	| "pending"
	| "paid"
	| "refunded"
	| "partially_refunded"
	| "void";

export type InvoiceBillingReason =
	| "purchase"
	| "subscription_create"
	| "subscription_cycle"
	| "subscription_update";

export type InvoiceDto = {
	id: string;
	number: string;
	createdAt: string;
	status: InvoiceStatus;
	/** Integer minor units. */
	totalAmount: number;
	currency: string;
	billingReason: InvoiceBillingReason;
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
