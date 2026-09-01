import { FunnelStep, type OrganizationStatus } from "@sinwy/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	CheckIcon,
	ClockIcon,
	CloudOffIcon,
	Loader2Icon,
	SearchXIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { pollUntilActive } from "#/modules/checkout/lib/poll-until-active";
import { FunnelProgress } from "#/modules/organizations/components/FunnelProgress";
import { postLoginFlagsKey } from "#/modules/user/lib/usePostLoginFlags";
import { Button } from "#/shared/components/ui/button";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { api } from "#/shared/lib/api";
import { protectedRoute } from "#/shared/lib/auth/protected-route";
import { cn } from "#/shared/lib/utils";

export const Route = createFileRoute("/checkout/success")({
	// expired session → bounce to login (which returns here), not a blind 401 poll
	...protectedRoute,
	validateSearch: z.object({ checkout_id: z.string().optional() }),
	component: CheckoutSuccessPage,
	pendingComponent: CheckoutSuccessPending,
	pendingMs: 0,
});

enum Phase {
	Resolving = "resolving",
	Activating = "activating",
	MissingCheckout = "missing-checkout",
	UnknownOrg = "unknown-org",
	Unreachable = "unreachable",
	TimedOut = "timed-out",
}

function PageShell({ children }: { children: React.ReactNode }) {
	return (
		<main className="page-wrap py-14">
			<div className="mx-auto w-full max-w-sm">
				<FunnelProgress current={FunnelStep.Pay} className="mb-8" />
				{children}
			</div>
		</main>
	);
}

function CheckoutSuccessPending() {
	return (
		<PageShell>
			<div className="space-y-3 text-center">
				<Skeleton className="mx-auto h-7 w-44 rounded-md" />
				<Skeleton className="mx-auto h-3.5 w-full rounded-md" />
				<Skeleton className="mx-auto h-3.5 w-2/3 rounded-md" />
				<div className="space-y-2.5 pt-3">
					<Skeleton className="h-4 w-40 rounded-md" />
					<Skeleton className="h-4 w-56 rounded-md" />
					<Skeleton className="h-4 w-48 rounded-md" />
				</div>
			</div>
		</PageShell>
	);
}

function CheckoutSuccessPage() {
	const { checkout_id: checkoutId } = Route.useSearch();
	const [attempt, setAttempt] = useState(0);

	return (
		<Activation
			key={attempt}
			checkoutId={checkoutId}
			onRetry={() => setAttempt((n) => n + 1)}
		/>
	);
}

function Activation({
	checkoutId,
	onRetry,
}: {
	checkoutId: string | undefined;
	onRetry: () => void;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [phase, setPhase] = useState<Phase>(
		checkoutId ? Phase.Resolving : Phase.MissingCheckout,
	);

	useEffect(() => {
		if (!checkoutId) return;
		let cancelled = false;

		void (async () => {
			// Polar carries the org id in the checkout metadata, resolve it
			// server-side so the handoff survives a different tab/browser context.
			const res = await api<{ organizationId: string }>(
				`/organizations/checkout/${checkoutId}`,
			);
			if (cancelled) return;
			if (!res.isSuccess) {
				// only a 4xx is the API telling us this checkout is unknown;
				// anything else means we never got an answer
				const answered = res.code >= 400 && res.code < 500;
				setPhase(answered ? Phase.UnknownOrg : Phase.Unreachable);
				return;
			}
			const orgId = res.data.organizationId;
			setPhase(Phase.Activating);

			const active = await pollUntilActive(
				async () => {
					const status = await api<{ status: OrganizationStatus }>(
						`/organizations/${orgId}/status`,
					);
					return status.isSuccess ? status.data.status : null;
				},
				{ isCancelled: () => cancelled },
			);
			if (cancelled) return;
			if (!active) {
				setPhase(Phase.TimedOut);
				return;
			}
			await queryClient.invalidateQueries({ queryKey: postLoginFlagsKey });
			void navigate({
				to: "/organizations/$id/onboarding",
				params: { id: orgId },
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [checkoutId, navigate, queryClient]);

	const activating = phase === Phase.Resolving || phase === Phase.Activating;

	return (
		<PageShell>
			<div className="space-y-3 text-center">
				{activating ? (
					<ActivationProgress phase={phase} />
				) : phase === Phase.MissingCheckout ? (
					<FailedState
						icon={SearchXIcon}
						title="Missing checkout details"
						description="This page was opened without a checkout reference. If you just paid, your payment is safe and your organization will activate on its own, check back from your dashboard in a minute."
					>
						<HomeButton primary />
					</FailedState>
				) : phase === Phase.UnknownOrg ? (
					<FailedState
						icon={SearchXIcon}
						title="Payment received"
						description="We couldn't match this checkout to an organization yet. Your payment is safe, this usually resolves itself within a minute."
					>
						<Button variant="outline" onClick={onRetry}>
							Try again
						</Button>
						<HomeButton />
					</FailedState>
				) : phase === Phase.Unreachable ? (
					<FailedState
						icon={CloudOffIcon}
						title="Payment received"
						description="Your payment went through, but we couldn't reach the server to finish setting up your organization. Check your connection and try again."
					>
						<Button variant="outline" onClick={onRetry}>
							Try again
						</Button>
						<HomeButton />
					</FailedState>
				) : (
					<FailedState
						icon={ClockIcon}
						title="Still activating"
						description="Your payment is confirmed, but activation is taking longer than expected. Nothing is wrong, the confirmation from our payment provider may still be on its way."
					>
						<Button variant="outline" onClick={onRetry}>
							Check again
						</Button>
						<HomeButton />
					</FailedState>
				)}
			</div>
		</PageShell>
	);
}

function ActivationProgress({ phase }: { phase: Phase }) {
	// reassure during the long poll window instead of sitting silent for 60s
	const [slow, setSlow] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => setSlow(true), 15_000);
		return () => clearTimeout(timer);
	}, []);

	const resolving = phase === Phase.Resolving;

	return (
		<>
			<h1 className="text-2xl font-bold tracking-tight">Payment received</h1>
			<p className="text-sm text-muted-foreground">
				Hold tight while we finish setting up your organization.
			</p>
			<ol
				className="mx-auto w-fit space-y-2.5 pt-3 text-left text-sm"
				role="status"
				aria-live="polite"
			>
				<StepRow state="done">Payment confirmed</StepRow>
				<StepRow state={resolving ? "running" : "done"}>
					Linking payment to your organization
				</StepRow>
				<StepRow state={resolving ? "pending" : "running"}>
					Activating your organization
				</StepRow>
			</ol>
			{slow && (
				<p className="pt-2 text-xs text-muted-foreground">
					Taking a bit longer than usual, you can keep this page open, we'll
					redirect you as soon as it's ready.
				</p>
			)}
		</>
	);
}

function StepRow({
	state,
	children,
}: {
	state: "done" | "running" | "pending";
	children: React.ReactNode;
}) {
	return (
		<li
			className={cn(
				"flex items-center gap-2.5",
				state === "pending" && "text-muted-foreground",
			)}
		>
			<span className="flex size-5 items-center justify-center">
				{state === "done" ? (
					<CheckIcon className="size-4 text-success" aria-hidden />
				) : state === "running" ? (
					<Loader2Icon
						className="size-4 animate-spin text-muted-foreground"
						aria-hidden
					/>
				) : (
					<span className="size-1.5 rounded-full bg-muted-foreground/40" />
				)}
			</span>
			{children}
		</li>
	);
}

function FailedState({
	icon: Icon,
	title,
	description,
	children,
}: {
	icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<>
			<span className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
				<Icon className="size-5 text-muted-foreground" aria-hidden />
			</span>
			<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
			<p className="text-sm text-muted-foreground">{description}</p>
			<div className="flex items-center justify-center gap-2 pt-2">
				{children}
			</div>
		</>
	);
}

function HomeButton({ primary = false }: { primary?: boolean }) {
	return (
		<Button variant={primary ? "outline" : "ghost"} render={<Link to="/" />}>
			Back to home
		</Button>
	);
}
