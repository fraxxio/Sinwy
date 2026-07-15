import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "#/modules/auth/lib/auth-client";
import { requireAuth } from "#/modules/auth/lib/protected-route";

export const Route = createFileRoute("/organizations/$id/onboarding")({
	ssr: false,
	// Entering onboarding = entering Organization Mode (roadmap §6). setActive
	// fails for non-members, so it doubles as the membership gate for the page.
	beforeLoad: async ({ location, params }) => {
		const ctx = await requireAuth({ location });
		const { error } = await authClient.organization.setActive({
			organizationId: params.id,
		});
		if (error) throw redirect({ to: "/" });
		return ctx;
	},
	component: OnboardingPage,
});

// ponytail: wizard shell only — real page-builder steps (and an
// "onboarding completed" flag) come when there are steps to complete
function OnboardingPage() {
	return (
		<main className="page-wrap py-14">
			<div className="mx-auto w-full max-w-lg space-y-6">
				<div className="space-y-1.5">
					<h1 className="text-2xl font-bold tracking-tight">Welcome aboard</h1>
					<p className="text-sm text-muted-foreground">
						Your organization is active. Let's get it ready for customers.
					</p>
				</div>

				<div className="rounded-lg border p-5">
					<h2 className="font-semibold">Set up your page</h2>
					<p className="text-sm text-muted-foreground">
						The page builder is coming soon.
					</p>
				</div>
			</div>
		</main>
	);
}
