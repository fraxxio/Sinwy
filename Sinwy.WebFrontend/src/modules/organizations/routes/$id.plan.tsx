import type { OrganizationStatus, PlanSlug } from "@sinwy/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "#/modules/auth/lib/auth-client";
import { requireAuth } from "#/modules/auth/lib/protected-route";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { api } from "#/shared/lib/api";

export const Route = createFileRoute("/organizations/$id/plan")({
	ssr: false,
	beforeLoad: async ({ location, params }) => {
		const ctx = await requireAuth({ location });
		// an already-active org must not buy a second subscription
		const res = await api<{ status: OrganizationStatus }>(
			`/organizations/${params.id}/status`,
		);
		if (res.isSuccess && res.data.status === "active")
			throw redirect({
				to: "/organizations/$id/onboarding",
				params: { id: params.id },
			});
		return ctx;
	},
	component: PlanPage,
});

const plans = [
	{
		slug: "starter",
		name: "Starter",
		blurb: "For a single location getting started.",
	},
	{
		slug: "professional",
		name: "Professional",
		blurb: "For growing businesses that need more.",
	},
	{
		slug: "enterprise",
		name: "Enterprise",
		blurb: "For large operations with custom needs.",
	},
] as const satisfies readonly { slug: PlanSlug; name: string; blurb: string }[];

function PlanPage() {
	const { id } = Route.useParams();
	const [serverError, setServerError] = useState<string | null>(null);
	const [pendingSlug, setPendingSlug] = useState<string | null>(null);

	const choosePlan = async (slug: string) => {
		setServerError(null);
		setPendingSlug(slug);
		const { error } = await authClient.checkout({ slug, referenceId: id });
		if (error) {
			setServerError(error.message ?? "Checkout failed");
			setPendingSlug(null);
		}
		// On success better-auth redirects the browser to Polar.
	};

	return (
		<main className="page-wrap py-14">
			<div className="mb-8 space-y-1.5 text-center">
				<h1 className="text-2xl font-bold tracking-tight">Pick a plan</h1>
				<p className="text-sm text-muted-foreground">
					Your organization activates as soon as payment completes.
				</p>
			</div>

			<div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
				{plans.map((plan) => (
					<div
						key={plan.slug}
						className="flex flex-col gap-3 rounded-lg border p-5"
					>
						<h2 className="font-semibold">{plan.name}</h2>
						<p className="grow text-sm text-muted-foreground">{plan.blurb}</p>
						<Button
							disabled={pendingSlug !== null}
							onClick={() => void choosePlan(plan.slug)}
						>
							{pendingSlug === plan.slug ? "Redirecting…" : "Choose"}
						</Button>
					</div>
				))}
			</div>

			{serverError && (
				<FieldError className="mt-4 text-center">{serverError}</FieldError>
			)}
		</main>
	);
}
