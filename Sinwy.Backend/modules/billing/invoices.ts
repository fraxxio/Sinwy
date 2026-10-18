import { polarClient } from "@backend/infrastructure/polar";
import type { Order } from "@polar-sh/sdk/models/components/order";
import { MissingInvoiceBillingDetails } from "@polar-sh/sdk/models/errors/missinginvoicebillingdetails";
import { NotPaidOrder } from "@polar-sh/sdk/models/errors/notpaidorder";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import type { InvoiceDto, InvoiceListDto } from "@sinwy/shared";
import { z } from "zod";

export const invoiceListQuery = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type InvoiceListQuery = z.infer<typeof invoiceListQuery>;

// Every order of a subscription, renewals included, carries the checkout's
// referenceId (verified in the Polar sandbox). Matching on it instead of the
// stored subscription id keeps invoices of past subscriptions visible.
const belongsTo = (order: Order, organizationId: string) =>
	order.metadata["referenceId"] === organizationId;

// Order embeds the customer (email, billing address); only this leaves the module
const toInvoiceDto = (order: Order): InvoiceDto => ({
	id: order.id,
	number: order.invoiceNumber,
	createdAt: order.createdAt.toISOString(),
	status: order.status as InvoiceDto["status"],
	totalAmount: order.totalAmount,
	currency: order.currency,
	billingReason: order.billingReason as InvoiceDto["billingReason"],
	invoiceGenerated: order.isInvoiceGenerated,
});

export const listOrganizationInvoices = async (
	organizationId: string,
	{ page, limit }: InvoiceListQuery,
): Promise<InvoiceListDto> => {
	const { result } = await polarClient.orders.list({
		metadata: { referenceId: organizationId },
		sorting: ["-created_at"],
		page,
		limit,
	});
	return {
		items: result.items.map(toInvoiceDto),
		page,
		limit,
		total: result.pagination.totalCount,
	};
};

type InvoiceDownload =
	| { status: "ready"; url: string }
	| { status: "generating" }
	| { status: "not-found" }
	| { status: "unavailable"; message: string };

// 404 unknown id, 422 not even a valid id
const isMissingOrder = (error: unknown) =>
	error instanceof PolarError &&
	(error.statusCode === 404 || error.statusCode === 422);

/**
 * The order id comes from the client, so an order of another organization
 * is reported exactly like a missing one. Invoices are generated on first
 * request; the caller retries once Polar has rendered it.
 */
export const getInvoiceDownload = async (
	organizationId: string,
	orderId: string,
): Promise<InvoiceDownload> => {
	const order = await polarClient.orders
		.get({ id: orderId })
		.catch((error: unknown) => {
			if (isMissingOrder(error)) return null;
			throw error;
		});
	if (!order || !belongsTo(order, organizationId))
		return { status: "not-found" };

	if (order.isInvoiceGenerated) {
		const { url } = await polarClient.orders.invoice({ id: order.id });
		return { status: "ready", url };
	}

	try {
		await polarClient.orders.generateInvoice({ id: order.id });
	} catch (error) {
		// e.g. no billing address yet: the customer portal is where it's added
		if (
			error instanceof MissingInvoiceBillingDetails ||
			error instanceof NotPaidOrder
		)
			return { status: "unavailable", message: error.detail };
		throw error;
	}
	return { status: "generating" };
};
