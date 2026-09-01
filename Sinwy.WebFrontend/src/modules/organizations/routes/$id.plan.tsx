import {
	FunnelStep,
	type OrganizationStatus,
	type PlanSlug,
} from "@sinwy/shared";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { FunnelProgress } from "#/modules/organizations/components/FunnelProgress";
import {
	getPlanName,
	PlanCards,
} from "#/modules/organizations/components/PlanCards";
import {
	clearPreselectedPlan,
	readPreselectedPlan,
} from "#/modules/organizations/lib/preselected-plan";
import { Button } from "#/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "#/shared/components/ui/card";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { api } from "#/shared/lib/api";
import { authClient } from "#/shared/lib/auth/auth-client";
import { requireAuth } from "#/shared/lib/auth/protected-route";
import { cn } from "#/shared/lib/utils";

export const Route = createFileRoute("/organizations/$id/plan")({
	ssr: false,
	beforeLoad: async ({ location, params }) => {
		const ctx = await requireAuth({ location });
		// an already-active org must not buy a second subscription, so an
		// unreadable status blocks checkout rather than falling through
		const res = await api<{ status: OrganizationStatus }>(
			`/organizations/${params.id}/status`,
		);
		if (res.isSuccess && res.data.status === "active")
			throw redirect({
				to: "/organizations/$id/onboarding",
				params: { id: params.id },
			});
		return { ...ctx, statusError: res.isSuccess ? null : res.message };
	},
	component: PlanPage,
	pendingComponent: PlanPagePending,
	pendingMs: 0,
});

function PageShell({ children }: { children: React.ReactNode }) {
	return (
		<main className="page-wrap relative isolate py-14">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-50 -z-10 mx-auto h-96 w-full max-w-3xl rounded-full bg-primary/20 blur-3xl"
			/>
			<div className="mx-auto w-full max-w-5xl">
				<FunnelProgress
					current={FunnelStep.Plan}
					className="mb-8 justify-center"
				/>

				<div className="mx-auto mb-8 max-w-2xl space-y-3 text-center">
					<h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
						Plans that work best for your{" "}
						<span className="text-primary">Business</span>
					</h1>
					<p className="text-muted-foreground">
						Your organization activates as soon as payment completes. Explore
						which option is right for you.
					</p>
				</div>

				{children}
			</div>
		</main>
	);
}

function LineSkeleton({ className }: { className?: string }) {
	return (
		<div className="flex h-5 items-center">
			<Skeleton className={cn("h-3.5 rounded-md", className)} />
		</div>
	);
}

function PlanCardSkeleton({ popular }: { popular?: boolean }) {
	return (
		<Card
			className={
				popular ? "border border-primary ring-3 ring-primary/15" : undefined
			}
		>
			<CardHeader>
				<div className="flex h-7 items-center">
					<Skeleton className="h-5 w-24 rounded-md" />
				</div>
				<div>
					<LineSkeleton className="w-full" />
					<LineSkeleton className="w-2/3" />
				</div>
			</CardHeader>

			<CardContent className="space-y-5">
				<div className="flex h-9 items-center">
					<Skeleton className="h-8 w-28 rounded-md" />
				</div>

				<Skeleton className="h-10 rounded-md" />

				<ul className="space-y-3">
					{[0, 1, 2].map((row) => (
						<li key={row} className="flex h-5 items-center gap-2.5">
							<Skeleton className="size-5 rounded-md" />
							<Skeleton className="h-3.5 w-2/3 rounded-md" />
						</li>
					))}
				</ul>
			</CardContent>

			<CardFooter className="mt-auto flex-col items-start gap-3 border-t">
				<LineSkeleton className="w-28" />
				<ul className="space-y-3">
					{[0, 1, 2].map((row) => (
						<li key={row} className="flex h-5 items-center gap-2.5">
							<Skeleton className="size-5 rounded-full" />
							<Skeleton className="h-3.5 w-32 rounded-md" />
						</li>
					))}
				</ul>
			</CardFooter>
		</Card>
	);
}

function PlanPagePending() {
	return (
		<PageShell>
			<div className="mb-10 flex justify-center">
				<Skeleton className="h-10.5 w-60 rounded-full" />
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<PlanCardSkeleton />
				<PlanCardSkeleton popular />
				<PlanCardSkeleton />
			</div>
		</PageShell>
	);
}

function PlanPage() {
	const { id } = Route.useParams();
	const { statusError } = Route.useRouteContext();
	const router = useRouter();
	const [serverError, setServerError] = useState<string | null>(null);
	const [pendingSlug, setPendingSlug] = useState<string | null>(null);
	const [preselectedPlan, setPreselectedPlan] = useState<PlanSlug | null>(() =>
		readPreselectedPlan(),
	);

	if (statusError)
		return (
			<main className="page-wrap py-14">
				<div className="mx-auto w-full max-w-sm space-y-3 text-center">
					<h1 className="text-2xl font-bold tracking-tight">
						We couldn't verify this organization
					</h1>
					<p className="text-sm text-muted-foreground">
						{statusError}. We won't start a checkout until we can confirm it
						doesn't already have a subscription.
					</p>
					<Button variant="outline" onClick={() => void router.invalidate()}>
						Try again
					</Button>
				</div>
			</main>
		);

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

	const chooseDifferentPlan = () => {
		clearPreselectedPlan();
		setPreselectedPlan(null);
	};

	return (
		<PageShell>
			{preselectedPlan ? (
				<div className="mx-auto max-w-md space-y-4 text-center">
					<p className="text-muted-foreground">
						You already picked the{" "}
						<span className="font-semibold text-foreground">
							{getPlanName(preselectedPlan)}
						</span>{" "}
						plan earlier. Continue with it, or take another look at the options.
					</p>
					<div className="flex flex-col gap-3">
						<Button
							size="lg"
							disabled={pendingSlug !== null}
							onClick={() => {
								clearPreselectedPlan();
								void choosePlan(preselectedPlan);
							}}
						>
							{pendingSlug === preselectedPlan
								? "Redirecting…"
								: `Continue with ${getPlanName(preselectedPlan)}`}
						</Button>
						<Button
							size="lg"
							variant="outline"
							disabled={pendingSlug !== null}
							onClick={chooseDifferentPlan}
						>
							Choose a different plan
						</Button>
					</div>
				</div>
			) : (
				<PlanCards
					pendingSlug={pendingSlug}
					onChoosePlan={(slug) => void choosePlan(slug)}
				/>
			)}

			{serverError && (
				<FieldError className="mt-4 text-center">{serverError}</FieldError>
			)}
		</PageShell>
	);
}
