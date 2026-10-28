import type { PlanSlug } from "@sinwy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { CurrentPlanSection } from "#/modules/account-dashboard/components/billing/CurrentPlanSection";
import { InvoicesSection } from "#/modules/account-dashboard/components/billing/InvoicesSection";
import { ManageBillingSection } from "#/modules/account-dashboard/components/billing/ManageBillingSection";
import { PaymentFailedNotice } from "#/modules/account-dashboard/components/billing/PaymentFailedNotice";
import { PlanEndSection } from "#/modules/account-dashboard/components/billing/PlanEndSection";
import { ResumePanel } from "#/modules/account-dashboard/components/billing/ResumePanel";
import { subscriptionQuery } from "#/modules/account-dashboard/lib/billing-queries";
import { PlanCards } from "#/modules/organizations/components/PlanCards";
import {
	clearPreselectedPlan,
	readPreselectedPlan,
} from "#/modules/organizations/lib/preselected-plan";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { usePageRestored } from "#/shared/hooks/use-page-restored";
import { authClient } from "#/shared/lib/auth/auth-client";
import { authErrorMessage } from "#/shared/lib/auth/auth-error";
import { invalidateOrganizations } from "#/shared/lib/organizations";
import { getPlanName } from "#/shared/lib/plans";

export const Route = createFileRoute("/account/_shell/billing")({
	staticData: { crumb: "Billing" },
	validateSearch: z.object({
		change: z.literal("plan").optional().catch(undefined),
		page: z.number().int().min(2).optional().catch(undefined),
	}),
	component: BillingPage,
});

function BillingPage() {
	const queryClient = useQueryClient();
	const { data, isPending, isError, isFetching, refetch } =
		useQuery(subscriptionQuery);
	// reading the plan applies Polar's latest state, which can move slots
	const plan = data?.plan;
	const activeOrganizations = data?.activeOrganizations.length;
	useEffect(() => {
		if (plan !== undefined && activeOrganizations !== undefined)
			void invalidateOrganizations(queryClient);
	}, [plan, activeOrganizations, queryClient]);

	const header = (
		<PageHeader
			title="Billing"
			description="Your plan, the organizations it keeps active, invoices and payment method."
		/>
	);

	if (isPending)
		return (
			<>
				{header}
				<Skeleton className="h-64 rounded-xl" />
			</>
		);

	// a checkout must not start before we know there's no plan to change instead
	if (isError)
		return (
			<>
				{header}
				<div className="flex items-center gap-3">
					<FieldError>Couldn't load your plan.</FieldError>
					<Button
						variant="outline"
						size="sm"
						disabled={isFetching}
						onClick={() => void refetch()}
					>
						Try again
					</Button>
				</div>
			</>
		);

	if (data.suspended)
		return (
			<>
				{header}
				<div className="grid gap-6">
					<ResumePanel billing={data.billing} />
					<BillingDetails />
				</div>
			</>
		);

	if (data.plan === null)
		return (
			<>
				{header}
				<ChoosePlan />
			</>
		);

	return (
		<>
			{header}
			<div className="grid gap-6">
				{data.billing?.subscriptionStatus === "past_due" && (
					<PaymentFailedNotice />
				)}
				<BillingDetails withPlan />
			</div>
		</>
	);
}

function BillingDetails({ withPlan = false }: { withPlan?: boolean }) {
	const { change, page = 1 } = Route.useSearch();
	const navigate = Route.useNavigate();

	// the URL holds the dialog state so UpgradePrompt can deep-link into it
	const setChangePlanOpen = useCallback(
		(open: boolean) =>
			void navigate({
				search: (prev) => ({ ...prev, change: open ? "plan" : undefined }),
				replace: true,
			}),
		[navigate],
	);

	// pushed, so back returns to the previous page of invoices
	const setInvoicePage = (next: number) =>
		void navigate({
			search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }),
			resetScroll: false,
		});

	return (
		<ContentBox className="divide-y">
			{withPlan && (
				<CurrentPlanSection
					changePlanOpen={change === "plan"}
					onChangePlanOpenChange={setChangePlanOpen}
				/>
			)}
			<InvoicesSection page={page} onPageChange={setInvoicePage} />
			<ManageBillingSection />
			{withPlan && <PlanEndSection kind="suspend" />}
			{withPlan && <PlanEndSection kind="cancel" />}
		</ContentBox>
	);
}

function ChoosePlan() {
	const [serverError, setServerError] = useState<string | null>(null);
	const [pendingSlug, setPendingSlug] = useState<PlanSlug | null>(null);
	const [preselectedPlan, setPreselectedPlan] = useState<PlanSlug | null>(() =>
		readPreselectedPlan(),
	);
	// Back from Polar's checkout would otherwise keep "Redirecting…"
	usePageRestored(useCallback(() => setPendingSlug(null), []));

	const choosePlan = async (slug: PlanSlug) => {
		setServerError(null);
		setPendingSlug(slug);
		const { error } = await authClient.checkout({ slug });
		if (error) {
			setServerError(authErrorMessage(error));
			setPendingSlug(null);
		}
		// On success better-auth redirects the browser to Polar.
	};

	return (
		<div className="grid gap-6">
			<div className="space-y-1">
				<h2 className="font-heading text-xl font-semibold">Choose a plan</h2>
				<p className="text-sm text-muted-foreground">
					One plan covers every organization you own; the tier sets how many can
					be active at once. Your organization activates as soon as payment
					completes.
				</p>
			</div>
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
							onClick={() => {
								clearPreselectedPlan();
								setPreselectedPlan(null);
							}}
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
				<FieldError className="text-center">{serverError}</FieldError>
			)}
		</div>
	);
}
