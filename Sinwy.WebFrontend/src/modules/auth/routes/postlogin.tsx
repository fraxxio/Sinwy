import { createFileRoute, redirect } from "@tanstack/react-router";
import { postLoginDestination } from "#/modules/auth/lib/post-login";
import { requireAuth } from "#/shared/lib/auth/protected-route";
import { organizationsQuery } from "#/shared/lib/organizations";

// Dispatcher both login paths converge on: email login navigates here,
// Google OAuth uses it as callbackURL (can't run routing logic client-side).
export const Route = createFileRoute("/auth/postlogin")({
	ssr: false,
	beforeLoad: async ({ location, context }) => {
		const { session } = await requireAuth({ location });
		// a failed list must not read as "no orgs", so it surfaces the error boundary
		const organizations = await context.queryClient.fetchQuery({
			...organizationsQuery,
			staleTime: 0,
		});
		throw redirect(
			postLoginDestination(organizations, session.session.activeOrganizationId),
		);
	},
	component: () => null,
});
