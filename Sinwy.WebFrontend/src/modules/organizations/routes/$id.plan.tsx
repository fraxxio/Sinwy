import { createFileRoute, redirect } from "@tanstack/react-router";

// the plan is the owner's own, chosen on Account → Billing; kept for old links
export const Route = createFileRoute("/organizations/$id/plan")({
	beforeLoad: () => {
		throw redirect({ to: "/account/billing", replace: true });
	},
});
