import type { OrganizationSubscriptionDto } from "@sinwy/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";

export const billingKeys = {
	all: (organizationId: string) => ["billing", organizationId] as const,
	subscription: (organizationId: string) =>
		[...billingKeys.all(organizationId), "subscription"] as const,
};

// every fetch reaches Polar; no refetchInterval, invalidate after writes instead
export const subscriptionQuery = (organizationId: string) =>
	queryOptions({
		queryKey: billingKeys.subscription(organizationId),
		queryFn: async () => {
			const res = await api<OrganizationSubscriptionDto>(
				`/organizations/${organizationId}/subscription`,
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		staleTime: 30_000,
	});
