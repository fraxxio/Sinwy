import type { PaymentDto, PaymentListDto } from "@sinwy/shared";
import {
	keepPreviousData,
	type QueryClient,
	queryOptions,
} from "@tanstack/react-query";
import { toQueryString } from "#/modules/org-dashboard/lib/booking-search";
import {
	type PaymentsSearch,
	paymentsPath,
} from "#/modules/org-dashboard/lib/payment-search";
import { api } from "#/shared/lib/api";

export const paymentKeys = {
	all: (organizationId: string) => ["payments", organizationId] as const,
	list: (organizationId: string, params: PaymentsSearch) =>
		[...paymentKeys.all(organizationId), "list", params] as const,
};

export const invalidatePayments = (
	queryClient: QueryClient,
	organizationId: string,
) =>
	queryClient.invalidateQueries({ queryKey: paymentKeys.all(organizationId) });

export const paymentListQuery = (
	organizationId: string,
	params: PaymentsSearch,
) =>
	queryOptions({
		queryKey: paymentKeys.list(organizationId, params),
		queryFn: async () => {
			const res = await api<PaymentListDto>(
				paymentsPath(organizationId, toQueryString(params)),
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		placeholderData: keepPreviousData,
	});

export const markPaymentPaid = (organizationId: string, paymentId: string) =>
	api<PaymentDto>(paymentsPath(organizationId, `/${paymentId}/mark-paid`), {
		method: "POST",
	});
