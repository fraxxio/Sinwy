import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "#/modules/auth/lib/auth-client";
import { requireAuth } from "#/modules/auth/lib/protected-route";
import { AppSidebar } from "#/modules/dashboard/components/AppSidebar";
import { AppShell } from "#/shared/components/shell/AppShell";

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
	component: DashboardShell,
});

function DashboardShell() {
	const { organization } = Route.useRouteContext();

	return (
		<AppShell
			sidebar={
				<AppSidebar
					organizationName={organization.name}
					organizationSlug={organization.slug}
				/>
			}
			rootCrumb={{ label: organization.name, href: `/${organization.slug}` }}
		>
			<Outlet />
		</AppShell>
	);
}
