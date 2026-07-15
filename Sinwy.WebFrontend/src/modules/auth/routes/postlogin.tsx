import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "#/modules/auth/lib/auth-client";
import { postLoginDestination } from "#/modules/auth/lib/post-login";
import { requireAuth } from "#/modules/auth/lib/protected-route";

// Dispatcher both login paths converge on: email login navigates here,
// Google OAuth uses it as callbackURL (can't run routing logic client-side).
export const Route = createFileRoute("/auth/postlogin")({
	ssr: false,
	beforeLoad: async ({ location }) => {
		const { session } = await requireAuth({ location });
		const { data: orgs, error } = await authClient.organization.list();
		// a failed list must not read as "no orgs" — surface the error boundary instead
		if (error) throw new Error(error.message ?? "Failed to load organizations");
		throw redirect(
			postLoginDestination(orgs, session.session.activeOrganizationId),
		);
	},
	component: () => null,
});
