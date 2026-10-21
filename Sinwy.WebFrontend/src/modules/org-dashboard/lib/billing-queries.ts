import type {
	ChangePlanBody,
	InvoiceDownloadDto,
	InvoiceListDto,
	OrganizationSubscriptionDto,
} from "@sinwy/shared";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";
import { authClient } from "#/shared/lib/auth/auth-client";

export const billingKeys = {
	all: (organizationId: string) => ["billing", organizationId] as const,
	subscription: (organizationId: string) =>
		[...billingKeys.all(organizationId), "subscription"] as const,
	invoices: (organizationId: string) =>
		[...billingKeys.all(organizationId), "invoices"] as const,
};

export const INVOICES_PER_PAGE = 20;

export const fetchSubscription = async (organizationId: string) => {
	const res = await api<OrganizationSubscriptionDto>(
		`/organizations/${organizationId}/subscription`,
	);
	if (!res.isSuccess) throw new Error(res.message);
	return res.data;
};

// every fetch reaches Polar; no refetchInterval, invalidate after writes instead
export const subscriptionQuery = (organizationId: string) =>
	queryOptions({
		queryKey: billingKeys.subscription(organizationId),
		queryFn: () => fetchSubscription(organizationId),
		staleTime: 30_000,
	});

export const changePlan = (organizationId: string, body: ChangePlanBody) =>
	api<OrganizationSubscriptionDto>(
		`/organizations/${organizationId}/subscription/plan`,
		{ method: "POST", body: JSON.stringify(body) },
	);

export const invoicesQuery = (organizationId: string, page: number) =>
	queryOptions({
		queryKey: [...billingKeys.invoices(organizationId), page],
		queryFn: async () => {
			const res = await api<InvoiceListDto>(
				`/organizations/${organizationId}/invoices?page=${page}&limit=${INVOICES_PER_PAGE}`,
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		staleTime: 30_000,
		placeholderData: keepPreviousData,
	});

/** `data` is null on 202, while Polar renders the invoice. */
export const requestInvoiceDownload = (
	organizationId: string,
	orderId: string,
) =>
	api<InvoiceDownloadDto | null>(
		`/organizations/${organizationId}/invoices/${orderId}/download`,
	);

/** On success the auth client navigates the tab to Polar's customer portal. */
export const openPolarPortal = async () => {
	const { error } = await authClient.customer.portal();
	if (error) throw new Error(error.message ?? "Couldn't open Polar");
};
