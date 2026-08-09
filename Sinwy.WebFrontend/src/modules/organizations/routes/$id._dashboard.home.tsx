import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/organizations/$id/_dashboard/home")({
	staticData: { crumb: "Home" },
	component: OrganizationHomePage,
});

function OrganizationHomePage() {
	return (
		<>
			<div className="grid auto-rows-min gap-4 md:grid-cols-3">
				<div className="aspect-video rounded-xl bg-muted/50" />
				<div className="aspect-video rounded-xl bg-muted/50" />
				<div className="aspect-video rounded-xl bg-muted/50" />
			</div>
			<div className="min-h-screen flex-1 rounded-xl bg-muted/50 md:min-h-min" />
		</>
	);
}
