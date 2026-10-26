import type {
	AcceptTransferDto,
	AccountDeletionPreviewDto,
	IncomingTransferDto,
	PlanSlug,
} from "@sinwy/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";
import { authClient } from "#/shared/lib/auth/auth-client";

export const accountKeys = {
	accounts: ["account", "accounts"],
	sessions: ["account", "sessions"],
	deletionPreview: ["account", "deletion-preview"],
	incomingTransfers: ["account", "incoming-transfers"],
} as const;

export const accountsQuery = queryOptions({
	queryKey: accountKeys.accounts,
	queryFn: async () => {
		const { data, error } = await authClient.listAccounts();
		if (error) throw new Error(error.message ?? "Couldn't load accounts");
		return data ?? [];
	},
});

export const sessionsQuery = queryOptions({
	queryKey: accountKeys.sessions,
	queryFn: async () => {
		const { data, error } = await authClient.listSessions();
		if (error) throw new Error(error.message ?? "Couldn't load sessions");
		return data ?? [];
	},
});

export const deletionPreviewQuery = queryOptions({
	queryKey: accountKeys.deletionPreview,
	queryFn: async () => {
		const res = await api<AccountDeletionPreviewDto>("/user/deletion-preview");
		if (!res.isSuccess) throw new Error(res.message);
		return res.data;
	},
});

export const hasCredentialAccount = (accounts: { providerId: string }[]) =>
	accounts.some((account) => account.providerId === "credential");

/** Makes `useSession` refetch after a user write that bypassed the auth client. */
export const refreshSession = () => authClient.$store.notify("$sessionSignal");

export type SessionUser = (typeof authClient.$Infer.Session)["user"];

export const incomingTransfersQuery = queryOptions({
	queryKey: accountKeys.incomingTransfers,
	queryFn: async () => {
		const res = await api<IncomingTransferDto[]>("/transfers/incoming");
		if (!res.isSuccess) throw new Error(res.message);
		return res.data;
	},
});

export const acceptTransfer = (transferId: string) =>
	api<AcceptTransferDto>(`/transfers/${transferId}/accept`, {
		method: "POST",
	});

/**
 * The plan checkout for an accepted transfer, which completes once the plan
 * lands. On success the auth client navigates the tab to Polar.
 */
export const checkoutForTransfer = async (
	slug: PlanSlug,
	transferId: string,
) => {
	// the backend's checkout hook reads transferId; the plugin's body type doesn't list it
	const body = { slug, transferId };
	const { error } = await authClient.checkout(body);
	if (error) throw new Error(error.message ?? "Checkout failed");
};

export const declineTransfer = (transferId: string) =>
	api<null>(`/transfers/${transferId}/decline`, { method: "POST" });
