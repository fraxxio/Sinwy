import { hasPermission, type Permission } from "@sinwy/shared";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { raiseAccessDenied } from "#/shared/lib/auth/access-denied";
import { authClient } from "#/shared/lib/auth/auth-client";
import {
	memberAccessQuery,
	type OrgRouteContext,
} from "#/shared/lib/auth/permissions";

/**
 * Guard: throws a redirect to login if there's no session, else returns it.
 * Call inside a route's beforeLoad. Requires ssr:false on the route —
 * authClient reads cookies client-side only. The requested URL rides the
 * `redirect` search param so login can return the user where they were going.
 */
export const requireAuth = async ({
	location,
}: {
	location: { href: string };
}) => {
	const { data } = await authClient.getSession();
	if (!data)
		throw redirect({
			to: "/auth/login",
			search: { redirect: location.href },
		});
	return { session: data };
};

/** Sugar for the common case: spread into a route with no extra beforeLoad. */
export const protectedRoute = {
	ssr: false,
	beforeLoad: requireAuth,
} as const;

/**
 * Guard: resolves the caller's roles in the organization. Cached briefly so
 * in-dashboard navigation does not refetch; a role change in the DB shows up
 * on the next fresh load. Unreadable membership leaves the dashboard.
 */
export const requireMember = async (
	queryClient: QueryClient,
	organizationId: string,
) => {
	const member = await queryClient
		.fetchQuery(memberAccessQuery(organizationId))
		.catch(() => null);
	if (!member) throw redirect({ to: "/" });
	return member;
};

/**
 * beforeLoad for routes under the org shell. Denied → redirect to the
 * organization Overview, which needs no permission so this can never loop.
 * Link preloads still redirect but raise no notice.
 */
export const requirePermission =
	(permission: Permission) =>
	({ context, preload }: { context: OrgRouteContext; preload: boolean }) => {
		if (hasPermission(context.member.roles, permission)) return;
		if (!preload) raiseAccessDenied();
		throw redirect({
			to: "/$organizationSlug",
			params: { organizationSlug: context.organization.slug },
		});
	};
