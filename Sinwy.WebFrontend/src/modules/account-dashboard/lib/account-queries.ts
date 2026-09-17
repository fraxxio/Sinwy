import type { AccountDeletionPreviewDto } from "@sinwy/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "#/shared/lib/api";
import { authClient } from "#/shared/lib/auth/auth-client";

export const accountKeys = {
	accounts: ["account", "accounts"],
	sessions: ["account", "sessions"],
	deletionPreview: ["account", "deletion-preview"],
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
