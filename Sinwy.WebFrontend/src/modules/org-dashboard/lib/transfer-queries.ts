import type { OfferTransferBody, OrganizationTransferDto } from "@sinwy/shared";
import { queryOptions } from "@tanstack/react-query";
import { membersQuery } from "#/modules/org-dashboard/lib/team-queries";
import { api } from "#/shared/lib/api";

export const transferKeys = {
	open: (organizationId: string) =>
		["transfer", organizationId, "open"] as const,
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
		...membersQuery(organizationId),
		select: (members) =>
			members
				.filter((member) => member.userId !== ownerUserId)
				.map(({ userId, name, email }) => ({ userId, name, email })),
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
