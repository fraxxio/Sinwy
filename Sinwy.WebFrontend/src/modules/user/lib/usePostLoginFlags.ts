import type { PostLoginFlags } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "#/modules/auth/lib/auth-client";
import { api } from "#/shared/lib/api";

export const postLoginFlagsKey = ["user", "flags"] as const;

/**
 * Rarely-changing flags, read once per app load. A failed read is indistinguishable
 * from "nothing to resume" on purpose, the prompt is optional.
 */
export function usePostLoginFlags() {
	const { data: session } = authClient.useSession();

	return useQuery({
		queryKey: postLoginFlagsKey,
		queryFn: async (): Promise<PostLoginFlags | null> => {
			const res = await api<PostLoginFlags>("/user/flags");
			return res.isSuccess ? res.data : null;
		},
		enabled: typeof window !== "undefined" && !!session,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnMount: false,
		retry: false,
	});
}
