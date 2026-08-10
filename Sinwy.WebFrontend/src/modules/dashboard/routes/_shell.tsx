import {
	createFileRoute,
	Outlet,
	redirect,
	useMatches,
} from "@tanstack/react-router";
import { authClient } from "#/modules/auth/lib/auth-client";
import { requireAuth } from "#/modules/auth/lib/protected-route";
import { DashboardLayout } from "#/modules/dashboard/components/DashboardLayout";

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
	const matches = useMatches();
	const breadcrumbs = matches.flatMap((match) =>
		match.staticData.crumb
			? [{ label: match.staticData.crumb, href: match.pathname }]
			: [],
	);

	return (
		<DashboardLayout
			organizationName={organization.name}
			breadcrumbs={breadcrumbs}
		>
			<Outlet />
		</DashboardLayout>
	);
}
