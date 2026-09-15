import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "#/shared/lib/auth/auth-client";

/**
 * Ends the session and drops every cached query so the next user on this tab
 * never sees the previous one's data (member roles, flags, organizations).
 */
export function useSignOut() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	return async () => {
		await authClient.signOut();
		queryClient.clear();
		await navigate({ to: "/" });
	};
}
