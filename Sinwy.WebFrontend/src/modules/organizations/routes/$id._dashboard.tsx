import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { protectedRoute } from "#/modules/auth/lib/protected-route";
import { DashboardLayout } from "#/modules/dashboard/components/DashboardLayout";

export const Route = createFileRoute("/organizations/$id/_dashboard")({
	...protectedRoute,
	staticData: { appShell: true },
	component: DashboardShell,
});

function DashboardShell() {
	const matches = useMatches();
	const breadcrumbs = matches.flatMap((match) =>
		match.staticData.crumb
			? [{ label: match.staticData.crumb, href: match.pathname }]
			: [],
	);

	return (
		<DashboardLayout breadcrumbs={breadcrumbs}>
			<Outlet />
		</DashboardLayout>
	);
}
