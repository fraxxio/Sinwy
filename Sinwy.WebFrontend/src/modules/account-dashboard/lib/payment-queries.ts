import type {
	CustomerPaymentDetailDto,
	CustomerPaymentListDto,
} from "@sinwy/shared";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";

export const accountPaymentKeys = {
	all: ["account-payments"] as const,
	list: (page: number) =>
		[...accountPaymentKeys.all, "list", { page }] as const,
	detail: (paymentId: string) =>
		[...accountPaymentKeys.all, "detail", paymentId] as const,
};

export const accountPaymentsQuery = (page: number) =>
	queryOptions({
		queryKey: accountPaymentKeys.list(page),
		queryFn: async () => {
			const res = await api<CustomerPaymentListDto>(
				`/account/payments?page=${page}`,
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		placeholderData: keepPreviousData,
	});

/** Null when the payment doesn't exist, is void, or isn't the session user's. */
export const accountPaymentQuery = (paymentId: string) =>
	queryOptions({
		queryKey: accountPaymentKeys.detail(paymentId),
		queryFn: async () => {
			const res = await api<CustomerPaymentDetailDto>(
				`/account/payments/${encodeURIComponent(paymentId)}`,
			);
			if (res.isSuccess) return res.data;
			if (res.code === 404) return null;
			throw new Error(res.message);
		},
	});
