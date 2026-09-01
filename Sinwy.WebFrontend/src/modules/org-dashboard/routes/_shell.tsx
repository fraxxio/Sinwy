import {
	createFileRoute,
	linkOptions,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { OrganizationSidebar } from "#/modules/org-dashboard/components/OrganizationSidebar";
import { AppShell } from "#/shared/components/shell/AppShell";
import { authClient } from "#/shared/lib/auth/auth-client";
import { requireAuth } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell")({
	ssr: false,
	beforeLoad: async ({ location, params }) => {
		const ctx = await requireAuth({ location });
		const { data, error } = await authClient.organization.setActive({
			organizationSlug: params.organizationSlug,
		});
		if (error || !data) throw redirect({ to: "/" });
		return { ...ctx, organization: data };
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
