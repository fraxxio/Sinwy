import type {
	AccountSubscriptionDto,
	ChangePlanBody,
	InvoiceDownloadDto,
	InvoiceListDto,
} from "@sinwy/shared";
import {
	keepPreviousData,
	type QueryClient,
	queryOptions,
} from "@tanstack/react-query";
import { api } from "#/shared/lib/api";
import { authClient } from "#/shared/lib/auth/auth-client";
import { authErrorMessage } from "#/shared/lib/auth/auth-error";

export const billingKeys = {
	all: ["billing"] as const,
	subscription: ["billing", "subscription"] as const,
	invoices: ["billing", "invoices"] as const,
};

export const INVOICES_PER_PAGE = 20;

export const fetchSubscription = async () => {
	const res = await api<AccountSubscriptionDto>("/account/subscription");
	if (!res.isSuccess) throw new Error(res.message);
	return res.data;
};

// every fetch reaches Polar; no refetchInterval, invalidate after writes instead
export const subscriptionQuery = queryOptions({
	queryKey: billingKeys.subscription,
	queryFn: fetchSubscription,
	staleTime: 30_000,
});

/** After anything that changes the plan or how many slots are in use. */
export const invalidateSubscription = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({ queryKey: billingKeys.subscription });

export const changePlan = (body: ChangePlanBody) =>
	api<AccountSubscriptionDto>("/account/subscription/plan", {
		method: "POST",
		body: JSON.stringify(body),
	});

/** Takes back a scheduled downgrade. */
export const cancelPlanChange = () =>
	api<AccountSubscriptionDto>("/account/subscription/plan/cancel", {
		method: "POST",
	});

export type SubscriptionAction =
	| "suspend"
	| "unsuspend"
	| "resume"
	| "cancel"
	| "uncancel";

export const runSubscriptionAction = (action: SubscriptionAction) =>
	api<AccountSubscriptionDto>(`/account/subscription/${action}`, {
		method: "POST",
	});

export const invoicesQuery = (page: number) =>
	queryOptions({
		queryKey: [...billingKeys.invoices, page],
		queryFn: async () => {
			const res = await api<InvoiceListDto>(
				`/account/invoices?page=${page}&limit=${INVOICES_PER_PAGE}`,
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		staleTime: 30_000,
		placeholderData: keepPreviousData,
	});

/** `data` is null on 202, while Polar renders the invoice. */
export const requestInvoiceDownload = (orderId: string) =>
	api<InvoiceDownloadDto | null>(`/account/invoices/${orderId}/download`);

/** On success the auth client navigates the tab to Polar's customer portal. */
export const openPolarPortal = async () => {
	const { error } = await authClient.customer.portal();
	if (error) throw new Error(authErrorMessage(error));
};

export type OrganizationSlotAction = "activate" | "deactivate";

export const runOrganizationSlotAction = (
	organizationId: string,
	action: OrganizationSlotAction,
) =>
	api<null>(`/account/organizations/${organizationId}/${action}`, {
		method: "POST",
	});

/** Organizations the plan can still activate; 0 without a plan. */
export const freeSlots = (
	subscription: Pick<
		AccountSubscriptionDto,
		"organizationLimit" | "activeOrganizations"
	>,
) =>
	Math.max(
		0,
		subscription.organizationLimit - subscription.activeOrganizations.length,
	);
