import { FunnelStep, type OrganizationSummary } from "@sinwy/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon, ClockIcon, CloudOffIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
	billingKeys,
	fetchSubscription,
	runOrganizationSlotAction,
} from "#/modules/account-dashboard/lib/billing-queries";
import { FunnelProgress } from "#/modules/organizations/components/FunnelProgress";
import { postLoginFlagsKey } from "#/modules/user/lib/usePostLoginFlags";
import { Button } from "#/shared/components/ui/button";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { api } from "#/shared/lib/api";
import { protectedRoute } from "#/shared/lib/auth/protected-route";
import { invalidateOrganizations } from "#/shared/lib/organizations";
import { pollUntil } from "#/shared/lib/poll-until";
import { cn } from "#/shared/lib/utils";

export const Route = createFileRoute("/checkout/success")({
	// expired session → bounce to login (which returns here), not a blind 401 poll
	...protectedRoute,
	validateSearch: z.object({
		checkout_id: z.string().optional(),
		// set when the plan was bought to take over this organization
		organization: z.string().optional(),
	}),
	component: CheckoutSuccessPage,
	pendingComponent: CheckoutSuccessPending,
	pendingMs: 0,
});

enum Phase {
	Plan = "plan",
	Organization = "organization",
	Unreachable = "unreachable",
	TimedOut = "timed-out",
}

function PageShell({
	showSteps = false,
	children,
}: {
	showSteps?: boolean;
	children: React.ReactNode;
}) {
	return (
		<main className="page-wrap py-14">
			<div className="mx-auto w-full max-w-sm">
				{showSteps && (
					<FunnelProgress current={FunnelStep.Pay} className="mb-8" />
				)}
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
	const [attempt, setAttempt] = useState(0);

	return <Activation key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

/** The oldest draft the user owns: the one the funnel was paying for. */
const findFunnelDraft = (organizations: OrganizationSummary[]) =>
	organizations.find((org) => org.isOwner && org.draft) ?? null;

const fetchOrganizations = async () => {
	const res = await api<OrganizationSummary[]>("/organizations");
	return res.isSuccess ? res.data : null;
};

function Activation({ onRetry }: { onRetry: () => void }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { organization: transferredId } = Route.useSearch();
	const [phase, setPhase] = useState<Phase>(Phase.Plan);
	const [draft, setDraft] = useState<OrganizationSummary | null>(null);
	const [transferred, setTransferred] = useState<OrganizationSummary | null>(
		null,
	);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const list = await api<OrganizationSummary[]>("/organizations");
			if (cancelled) return;
			if (!list.isSuccess) {
				setPhase(Phase.Unreachable);
				return;
			}
			const target = transferredId
				? (list.data.find((org) => org.id === transferredId) ?? null)
				: null;
			// a plan bought for a transfer never activates a draft
			const funnelDraft = transferredId ? null : findFunnelDraft(list.data);
			setDraft(funnelDraft);
			setTransferred(target);

			// the plan is projected from Polar's webhook, or reconciled on read
			const subscription = await pollUntil(
				fetchSubscription,
				(subscription) => subscription.plan !== null,
				{ isCancelled: () => cancelled },
			);
			if (cancelled) return;
			if (!subscription) {
				setPhase(Phase.TimedOut);
				return;
			}
			queryClient.setQueryData(billingKeys.subscription, subscription);
			if (transferredId) {
				setPhase(Phase.Organization);
				// the plan's projection completes the transfer
				const owned = await pollUntil(
					fetchOrganizations,
					(organizations) =>
						organizations.some(
							(org) => org.id === transferredId && org.isOwner,
						),
					{ attempts: 5, isCancelled: () => cancelled },
				);
				if (cancelled) return;
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: postLoginFlagsKey }),
					invalidateOrganizations(queryClient),
				]);
				const name = target?.name ?? "The organization";
				toast.add(
					owned
						? { type: "success", title: `${name} is yours`, timeout: 4_000 }
						: {
								type: "info",
								title: "Your plan is active",
								description: `${name} hasn't moved to you yet. Review the offer in your organizations.`,
							},
				);
				void navigate({ to: "/account/organizations" });
				return;
			}
			if (!funnelDraft) {
				await queryClient.invalidateQueries({ queryKey: postLoginFlagsKey });
				void navigate({ to: "/account/billing" });
				return;
			}

			setPhase(Phase.Organization);
			const activated = await runOrganizationSlotAction(
				funnelDraft.id,
				"activate",
			);
			if (cancelled) return;
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: postLoginFlagsKey }),
				queryClient.invalidateQueries({ queryKey: billingKeys.subscription }),
				invalidateOrganizations(queryClient),
			]);
			if (!activated.isSuccess) {
				toast.add({
					type: "info",
					title: "Your plan is active",
					description: `${funnelDraft.name} couldn't be activated (${activated.message}). Activate it from your organizations.`,
				});
				void navigate({ to: "/account/organizations" });
				return;
			}
			void navigate({
				to: "/organizations/$id/onboarding",
				params: { id: funnelDraft.id },
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [navigate, queryClient, transferredId]);

	const activating = phase === Phase.Plan || phase === Phase.Organization;

	return (
		<PageShell showSteps={draft !== null}>
			<div className="space-y-3 text-center">
				{activating ? (
					<ActivationProgress
						phase={phase}
						organizationStep={
							transferredId
								? `Transferring ${transferred?.name ?? "the organization"} to you`
								: draft && "Activating your organization"
						}
					/>
				) : phase === Phase.Unreachable ? (
					<FailedState
						icon={CloudOffIcon}
						title="Payment received"
						description="Your payment went through, but we couldn't reach the server to finish setting up your plan. Check your connection and try again."
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

function ActivationProgress({
	phase,
	organizationStep,
}: {
	phase: Phase;
	organizationStep: string | null;
}) {
	// reassure during the long poll window instead of sitting silent for 60s
	const [slow, setSlow] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => setSlow(true), 15_000);
		return () => clearTimeout(timer);
	}, []);

	const planDone = phase === Phase.Organization;

	return (
		<>
			<h1 className="text-2xl font-bold tracking-tight">Payment received</h1>
			<p className="text-sm text-muted-foreground">
				Hold tight while we finish setting up your plan.
			</p>
			<ol
				className="mx-auto w-fit space-y-2.5 pt-3 text-left text-sm"
				role="status"
				aria-live="polite"
			>
				<StepRow state="done">Payment confirmed</StepRow>
				<StepRow state={planDone ? "done" : "running"}>
					Activating your plan
				</StepRow>
				{organizationStep && (
					<StepRow state={planDone ? "running" : "pending"}>
						{organizationStep}
					</StepRow>
				)}
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
