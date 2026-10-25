import {
	PolarApiErrors,
	type PolarFailure,
	type PolarModels,
	polarClient,
} from "@backend/infrastructure/polar";
import {
	INVOICE_BILLING_REASONS,
	INVOICE_STATUSES,
	type InvoiceDto,
	type InvoiceListDto,
} from "@sinwy/shared";
import { z } from "zod";
import { knownValue, toPolarFailure } from "./polar";

export const invoiceListQuery = z.object({
	// bounded: Polar refuses huge pages with a 422
	page: z.coerce.number().int().min(1).max(10_000).default(1),
	limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuery>;

type Order = PolarModels.Order;

// by the customer, not the stored subscription id, so invoices of past
// subscriptions stay visible
const belongsTo = (order: Order, userId: string) =>
	order.customer.external_id === userId;

// Order embeds the customer (email, billing address); only this leaves the module
const toInvoiceDto = (order: Order): InvoiceDto => ({
	id: order.id,
	number: order.invoice_number,
	createdAt: order.created_at,
	status: knownValue(INVOICE_STATUSES, order.status, "order.status"),
	totalAmount: order.total_amount,
	currency: order.currency,
	billingReason: knownValue(
		INVOICE_BILLING_REASONS,
		order.billing_reason,
		"order.billing_reason",
	),
	invoiceGenerated: order.is_invoice_generated,
});

export const listAccountInvoices = async (
	userId: string,
	{ page, limit }: InvoiceListQuery,
): Promise<
	{ ok: true; data: InvoiceListDto } | { ok: false; error: PolarFailure }
> => {
	try {
		const result = await polarClient.orders.list({
			external_customer_id: userId,
			sorting: ["-created_at"],
			page,
			limit,
		});
		return {
			ok: true,
			data: {
				items: result.items.map(toInvoiceDto),
				page,
				limit,
				total: result.pagination.total_count,
			},
		};
	} catch (error) {
		return {
			ok: false,
			error: toPolarFailure(error, "Polar invoice list failed", { userId }),
		};
	}
};

type InvoiceDownload =
	| { status: "ready"; url: string }
	| { status: "generating" }
	| { status: "not-found" }
	| { status: "needs-details"; message: string }
	| { status: "not-paid" }
	| { status: "failed"; error: PolarFailure };

// 404 unknown id, 422 not even a valid id
const isMissingOrder = (error: unknown) =>
	error instanceof PolarApiErrors.ResourceNotFound ||
	error instanceof PolarApiErrors.HTTPValidationError;

const downloadInvoice = async (
	userId: string,
	orderId: string,
): Promise<InvoiceDownload> => {
	const order = await polarClient.orders
		.get(orderId)
		.catch((error: unknown) => {
			if (isMissingOrder(error)) return null;
			throw error;
		});
	if (!order || !belongsTo(order, userId)) return { status: "not-found" };

	if (order.is_invoice_generated) {
		const { url } = await polarClient.orders.invoice(order.id);
		return { status: "ready", url };
	}

	try {
		await polarClient.orders.generateInvoice(order.id);
	} catch (error) {
		// no billing name or address yet: the customer portal is where it's added
		if (error instanceof PolarApiErrors.MissingInvoiceBillingDetails)
			return { status: "needs-details", message: error.error.detail };
		if (error instanceof PolarApiErrors.OrderNotEligibleForInvoice)
			return { status: "not-paid" };
		throw error;
	}
	return { status: "generating" };
};

/**
 * The order id comes from the client, so another customer's order is reported exactly like a missing one. Invoices are generated on first
 * request; the caller retries once Polar has rendered it.
 */
export const getInvoiceDownload = async (
	userId: string,
	orderId: string,
): Promise<InvoiceDownload> => {
	try {
		return await downloadInvoice(userId, orderId);
	} catch (error) {
		return {
			status: "failed",
			error: toPolarFailure(error, "Polar invoice download failed", {
				userId,
				orderId,
			}),
		};
	}
};
