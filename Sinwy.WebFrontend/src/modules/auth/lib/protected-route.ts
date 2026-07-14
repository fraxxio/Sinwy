import { redirect } from "@tanstack/react-router";
import { authClient } from "#/modules/auth/lib/auth-client";

/**
 * Guard: throws a redirect to login if there's no session, else returns it.
 * Call inside a route's beforeLoad. Requires ssr:false on the route —
 * authClient reads cookies client-side only.
 */
export const requireAuth = async () => {
	const { data } = await authClient.getSession();
	if (!data) throw redirect({ to: "/auth/login" });
	return { session: data };
};

/** Sugar for the common case: spread into a route with no extra beforeLoad. */
export const protectedRoute = {
	ssr: false,
	beforeLoad: requireAuth,
} as const;
