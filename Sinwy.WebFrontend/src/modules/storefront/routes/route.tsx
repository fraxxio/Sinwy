import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$organizationSlug")({
	component: StorefrontLayout,
});

function StorefrontLayout() {
	return (
		<main className="page-wrap py-10">
			<Outlet />
		</main>
	);
}
