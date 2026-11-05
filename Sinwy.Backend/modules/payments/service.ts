import type { Membership } from "@authModule";
import { localDateRange } from "@backend/lib/localDate";
import { getOrganizationLocale } from "@organizationsModule";
import { todayIn } from "@servicesModule";
import {
	type CustomerPaymentDetailDto,
	type CustomerPaymentDto,
	type CustomerPaymentListDto,
	type CustomerPaymentListQuery,
	PAYMENT_LIMITS,
	type PaymentDto,
	type PaymentExportQuery,
	type PaymentListDto,
	type PaymentListQuery,
	type PaymentProvider,
	type PaymentStatus,
} from "@sinwy/shared";
import { paymentsCsv } from "./csv";
import {
	type CustomerPaymentRow,
	countCustomerPayments,
	countPayments,
	findCustomerPayment,
	findCustomerPayments,
	findPayment,
	findPayments,
	markPaymentPaid,
	type PaymentRange,
	type PaymentRow,
	paymentExists,
	sumPayments,
} from "./repository";

type PaymentError = "not-found" | "inactive" | "not-pending";
export type Result<T> =
	| { ok: true; data: T }
	| { ok: false; error: PaymentError };

const fail = <E extends PaymentError>(error: E) =>
	({ ok: false, error }) as const;

const toPaymentDto = (row: PaymentRow): PaymentDto => ({
	id: row.payment.id,
	bookingId: row.payment.bookingId,
	amountMinor: row.payment.amountMinor,
	currency: row.payment.currency,
	status: row.payment.status as PaymentStatus,
	provider: row.payment.provider as PaymentProvider,
	providerRef: row.payment.providerRef,
	paidAt: row.payment.paidAt?.toISOString() ?? null,
	createdAt: row.payment.createdAt.toISOString(),
	customerName: row.customerName,
	serviceName: row.serviceName,
	startsAt: row.startsAt.toISOString(),
});

const toCustomerPaymentDto = (row: CustomerPaymentRow): CustomerPaymentDto => ({
	id: row.payment.id,
	bookingId: row.payment.bookingId,
	amountMinor: row.payment.amountMinor,
	currency: row.payment.currency,
	status: row.payment.status as PaymentStatus,
	provider: row.payment.provider as PaymentProvider,
	paidAt: row.payment.paidAt?.toISOString() ?? null,
	createdAt: row.payment.createdAt.toISOString(),
	serviceName: row.serviceName,
	startsAt: row.startsAt.toISOString(),
	organization: row.organization,
});

type ResolvedRange = {
	timezone: string;
	from: string;
	to: string;
	range: PaymentRange;
};

/** Missing dates default to the current month up to today, in the organization's timezone. */
const resolveRange = async (
	organizationId: string,
	query: PaymentExportQuery,
	now: Date,
): Promise<ResolvedRange | null> => {
	const locale = await getOrganizationLocale(organizationId);
	if (!locale) return null;
	const { timezone } = locale;
	const to = query.to ?? todayIn(timezone, now);
	const from = query.from ?? `${to.slice(0, 7)}-01`;
	const { start, end } = localDateRange(from, to, timezone);
	if (!start || !end) return null;
	return { timezone, from, to, range: { start, end } };
};

export const listPayments = async (
	membership: Membership,
	query: PaymentListQuery,
	now = new Date(),
): Promise<Result<PaymentListDto>> => {
	const { organizationId } = membership;
	const resolved = await resolveRange(organizationId, query, now);
	if (!resolved) return fail("not-found");

	const { range, from, to } = resolved;
	const [rows, total, totals] = await Promise.all([
		findPayments(organizationId, range, {
			limit: query.pageSize,
			offset: (query.page - 1) * query.pageSize,
		}),
		countPayments(organizationId, range),
		sumPayments(organizationId, range),
	]);
	return {
		ok: true,
		data: { items: rows.map(toPaymentDto), total, totals, from, to },
	};
};

export type PaymentsExport = { filename: string; csv: string };

export const exportPayments = async (
	membership: Membership,
	query: PaymentExportQuery,
	now = new Date(),
): Promise<Result<PaymentsExport>> => {
	const { organizationId } = membership;
	const resolved = await resolveRange(organizationId, query, now);
	if (!resolved) return fail("not-found");

	const rows = await findPayments(organizationId, resolved.range);
	return {
		ok: true,
		data: {
			filename: `payments-${resolved.from}-to-${resolved.to}.csv`,
			csv: paymentsCsv(rows.map(toPaymentDto), resolved.timezone),
		},
	};
};

/** Only a pending payment can be marked as paid, and only while the organization is active. */
export const markPaid = async (
	membership: Membership,
	paymentId: string,
	now = new Date(),
): Promise<Result<PaymentDto>> => {
	if (membership.status !== "active") return fail("inactive");
	const { organizationId } = membership;

	const updated = await markPaymentPaid(organizationId, paymentId, now);
	if (!updated)
		return fail(
			(await paymentExists(organizationId, paymentId))
				? "not-pending"
				: "not-found",
		);

	const row = await findPayment(organizationId, paymentId);
	return row ? { ok: true, data: toPaymentDto(row) } : fail("not-found");
};

export const listCustomerPayments = async (
	customerUserId: string,
	{ page }: CustomerPaymentListQuery,
): Promise<CustomerPaymentListDto> => {
	const limit = PAYMENT_LIMITS.customerListPageSize;
	const [rows, total] = await Promise.all([
		findCustomerPayments(customerUserId, {
			limit,
			offset: (page - 1) * limit,
		}),
		countCustomerPayments(customerUserId),
	]);
	return { items: rows.map(toCustomerPaymentDto), total };
};

/** Another customer's payment, or a void one, reads as not found. */
export const getCustomerPayment = async (
	customerUserId: string,
	paymentId: string,
): Promise<Result<CustomerPaymentDetailDto>> => {
	const row = await findCustomerPayment(customerUserId, paymentId);
	return row
		? {
				ok: true,
				data: { ...toCustomerPaymentDto(row), customerName: row.customerName },
			}
		: fail("not-found");
};
