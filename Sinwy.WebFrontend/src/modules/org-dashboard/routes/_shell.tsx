import {
	createFileRoute,
	linkOptions,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { OrganizationSidebar } from "#/modules/org-dashboard/components/OrganizationSidebar";
import { AppShell } from "#/shared/components/shell/AppShell";
import { authClient } from "#/shared/lib/auth/auth-client";
import { requireAuth, requireMember } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell")({
	ssr: false,
	beforeLoad: async ({ location, params, context, preload }) => {
		const ctx = await requireAuth({ location });
		// preloads must not move the active organization; the destination's own
		// non-preload load still activates it
		const { data, error } = preload
			? await authClient.organization.getFullOrganization({
					query: { organizationSlug: params.organizationSlug, membersLimit: 1 },
				})
			: await authClient.organization.setActive({
					organizationSlug: params.organizationSlug,
				});
		if (error || !data) throw redirect({ to: "/" });
		const member = await requireMember(context.queryClient, data.id);
		return { ...ctx, organization: data, member };
	},
	staticData: { appShell: true },
	component: OrganizationShell,
});

function OrganizationShell() {
	const { organization } = Route.useRouteContext();

	return (
		<AppShell
			sidebar={<OrganizationSidebar organizationSlug={organization.slug} />}
			rootCrumb={{
				label: organization.name,
				link: linkOptions({
					to: "/$organizationSlug",
					params: { organizationSlug: organization.slug },
				}),
			}}
		>
			<Outlet />
		</AppShell>
	);
}
