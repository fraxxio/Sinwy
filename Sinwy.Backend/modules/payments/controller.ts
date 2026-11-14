import { membershipFrom, sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler, IReqContext } from "@backend/lib/app/types";
import {
	API_ERROR_CODES,
	customerPaymentListQuerySchema,
	paymentExportQuerySchema,
	paymentListQuerySchema,
} from "@sinwy/shared";
import type { z } from "zod";
import { sendPaymentRecordedEmails } from "./emails";
import {
	exportPayments,
	getCustomerPayment,
	listCustomerPayments,
	listPayments,
	markPaid,
	type Result,
} from "./service";

type PaymentError = Extract<Result<never>, { ok: false }>["error"];

const respondError = (error: PaymentError) => {
	switch (error) {
		case "inactive":
			return fail(
				"This organization doesn't have an active plan yet",
				409,
				API_ERROR_CODES.ORGANIZATION_INACTIVE,
			);
		case "not-pending":
			return fail(
				"Only a pending payment can be marked as paid",
				409,
				API_ERROR_CODES.PAYMENT_STATUS_CHANGE_NOT_ALLOWED,
			);
		case "not-found":
			return fail("Not found", 404);
	}
};

const parseQuery = <T extends z.ZodType>(c: IReqContext, schema: T) => {
	const query = schema.safeParse(
		Object.fromEntries(new URL(c.req.url).searchParams),
	);
	return query.success
		? ({ ok: true, data: query.data } as const)
		: ({
				ok: false,
				response: fail(query.error.issues[0]?.message ?? "Invalid query", 400),
			} as const);
};

const paymentIdOf = (c: IReqContext) =>
	(c.req.params as { paymentId: string }).paymentId;

export const listPaymentsHandler: Handler = async (c) => {
	const query = parseQuery(c, paymentListQuerySchema);
	if (!query.ok) return query.response;

	const result = await listPayments(membershipFrom(c), query.data);
	return result.ok ? ok(result.data) : respondError(result.error);
};

export const exportPaymentsHandler: Handler = async (c) => {
	const query = parseQuery(c, paymentExportQuerySchema);
	if (!query.ok) return query.response;

	const result = await exportPayments(membershipFrom(c), query.data);
	if (!result.ok) return respondError(result.error);
	return new Response(result.data.csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${result.data.filename}"`,
		},
	});
};

export const markPaidHandler: Handler = async (c) => {
	const membership = membershipFrom(c);
	const result = await markPaid(membership, paymentIdOf(c));
	if (!result.ok) return respondError(result.error);
	await sendPaymentRecordedEmails(
		membership.organizationId,
		result.data.id,
		sessionFrom(c).user,
	);
	return ok(result.data, 200, "Marked as paid");
};

export const listCustomerPaymentsHandler: Handler = async (c) => {
	const query = parseQuery(c, customerPaymentListQuerySchema);
	if (!query.ok) return query.response;
	return ok(await listCustomerPayments(sessionFrom(c).user.id, query.data));
};

export const getCustomerPaymentHandler: Handler = async (c) => {
	const result = await getCustomerPayment(
		sessionFrom(c).user.id,
		paymentIdOf(c),
	);
	return result.ok ? ok(result.data) : respondError(result.error);
};
