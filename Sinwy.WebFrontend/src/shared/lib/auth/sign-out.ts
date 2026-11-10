import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { authClient } from "#/shared/lib/auth/auth-client";

/**
 * Ends the session and drops every cached query so the next user on this tab
 * never sees the previous one's data (member roles, flags, organizations).
 * `stay` reloads the current page signed out instead of going home.
 */
export function useSignOut({ stay = false }: { stay?: boolean } = {}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const router = useRouter();

	return async () => {
		await authClient.signOut();
		queryClient.clear();
		if (stay) await router.invalidate();
		else await navigate({ to: "/" });
	};
}
