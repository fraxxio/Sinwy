import { createFileRoute, redirect } from "@tanstack/react-router";
import { postLoginDestination } from "#/modules/auth/lib/post-login";
import { authClient } from "#/shared/lib/auth/auth-client";
import { requireAuth } from "#/shared/lib/auth/protected-route";

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
