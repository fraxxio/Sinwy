import type { OfferTransferBody, OrganizationTransferDto } from "@sinwy/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";
import { authClient } from "#/shared/lib/auth/auth-client";

export const transferKeys = {
	open: (organizationId: string) =>
		["transfer", organizationId, "open"] as const,
	members: (organizationId: string) =>
		["transfer", organizationId, "members"] as const,
};

export const openTransferQuery = (organizationId: string) =>
	queryOptions({
		queryKey: transferKeys.open(organizationId),
		queryFn: async () => {
			const res = await api<OrganizationTransferDto | null>(
				`/organizations/${organizationId}/transfer`,
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
	});

/** Everyone who could receive the organization: its members other than the owner. */
export const transferCandidatesQuery = (
	organizationId: string,
	ownerUserId: string,
) =>
	queryOptions({
		queryKey: transferKeys.members(organizationId),
		queryFn: async () => {
			const { data, error } = await authClient.organization.listMembers({
				query: { organizationId },
			});
			if (error) throw new Error(error.message ?? "Couldn't load members");
			return (data?.members ?? [])
				.filter((member) => member.userId !== ownerUserId)
				.map((member) => ({
					userId: member.userId,
					name: member.user.name,
					email: member.user.email,
				}));
		},
	});

export const offerTransfer = (
	organizationId: string,
	body: OfferTransferBody,
) =>
	api<OrganizationTransferDto>(`/organizations/${organizationId}/transfer`, {
		method: "POST",
		body: JSON.stringify(body),
	});

export const cancelTransfer = (organizationId: string) =>
	api<null>(`/organizations/${organizationId}/transfer`, { method: "DELETE" });
