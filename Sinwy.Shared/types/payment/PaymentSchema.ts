import { z } from "zod";
import { PAYMENT_LIMITS as LIMITS } from "./Payment";

const localDate = z.iso.date("Use a date like 2026-12-24");

const ordered = (range: {
	from?: string | undefined;
	to?: string | undefined;
}) => !range.from || !range.to || range.from <= range.to;
const orderedMessage = {
	message: "The start date must not be after the end date",
	path: ["to"],
};

/** Dates are local to the organization and inclusive, and filter on `createdAt`; the default is the current month. */
const paymentRange = z.object({
	from: localDate.optional(),
	to: localDate.optional(),
});

const page = z.coerce.number().int().min(1).default(1);

export const paymentListQuerySchema = paymentRange
	.extend({
		page,
		pageSize: z.coerce
			.number()
			.int()
			.min(1)
			.max(LIMITS.listMaxPageSize, `At most ${LIMITS.listMaxPageSize} per page`)
			.default(LIMITS.listPageSize),
	})
	.refine(ordered, orderedMessage);

export const paymentExportQuerySchema = paymentRange.refine(
	ordered,
	orderedMessage,
);

export const customerPaymentListQuerySchema = z.object({ page });

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type PaymentExportQuery = z.infer<typeof paymentExportQuerySchema>;
export type CustomerPaymentListQuery = z.infer<
	typeof customerPaymentListQuerySchema
>;
