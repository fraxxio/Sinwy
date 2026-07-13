import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/organizations/$id/plan")({
	component: PlanPage,
});

// ponytail: stub so Phase 2 can navigate here; Phase 3 builds the plan cards
function PlanPage() {
	return (
		<main className="page-wrap py-14">
			<h1 className="text-2xl font-bold tracking-tight">Pick a plan</h1>
			<p className="text-sm text-muted-foreground">Coming soon.</p>
		</main>
	);
}
