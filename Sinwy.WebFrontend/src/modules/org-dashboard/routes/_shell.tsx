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
	beforeLoad: async ({ location, params, context }) => {
		const ctx = await requireAuth({ location });
		const { data, error } = await authClient.organization.setActive({
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
