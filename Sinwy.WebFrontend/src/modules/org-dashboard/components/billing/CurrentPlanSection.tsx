import type { OrganizationSubscriptionDto } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { ChangePlanDialog } from "#/modules/org-dashboard/components/billing/ChangePlanDialog";
import { subscriptionQuery } from "#/modules/org-dashboard/lib/billing-queries";
import {
	describeSubscription,
	formatPrice,
} from "#/modules/org-dashboard/lib/subscription-status";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { getPlanName } from "#/shared/lib/plans";

export function CurrentPlanSection({
	organizationId,
	changePlanOpen,
	onChangePlanOpenChange,
}: {
	organizationId: string;
	changePlanOpen: boolean;
	onChangePlanOpenChange: (open: boolean) => void;
}) {
	const { data, isPending, isError, isFetching, refetch } = useQuery(
		subscriptionQuery(organizationId),
	);

	const retry = (
		<Button
			type="button"
			variant="link"
			size="sm"
			className="h-auto p-0"
			disabled={isFetching}
			onClick={() => void refetch()}
		>
			{isFetching ? "Retrying…" : "Retry"}
		</Button>
	);

	const plan = data?.plan ?? null;
	// Polar refuses plan changes on a subscription that is canceled or set to cancel
	const canChangePlan =
		plan !== null &&
		!data?.billing?.cancelAtPeriodEnd &&
		data?.billing?.subscriptionStatus !== "canceled";
	const cannotChangeReason = !data
		? null
		: plan === null
			? "There's no current plan to change from."
			: !canChangePlan
				? "The subscription is canceled or set to cancel. Resume it from the Polar portal first."
				: null;

	// a deep link (e.g. from an upgrade prompt) asked for the dialog it can't open
	useEffect(() => {
		if (!changePlanOpen || !cannotChangeReason) return;
		toast.add({
			id: "change-plan-unavailable",
			type: "info",
			title: "The plan can't be changed right now",
			description: cannotChangeReason,
		});
		onChangePlanOpenChange(false);
	}, [changePlanOpen, cannotChangeReason, onChangePlanOpenChange]);

	return (
		<SettingsSection
			id="plan"
			title="Plan"
			description="What this organization pays for."
			action={
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!canChangePlan}
					onClick={() => onChangePlanOpenChange(true)}
				>
					Change plan
				</Button>
			}
		>
			{isPending ? (
				<Skeleton className="h-16" />
			) : isError ? (
				<div className="flex items-center gap-3">
					<FieldError>Couldn't load your plan.</FieldError>
					{retry}
				</div>
			) : (
				<PlanSummary subscription={data} retry={retry} />
			)}
			{plan && (
				<ChangePlanDialog
					organizationId={organizationId}
					current={plan}
					interval={data?.billing?.interval ?? null}
					open={changePlanOpen && canChangePlan}
					onOpenChange={onChangePlanOpenChange}
				/>
			)}
		</SettingsSection>
	);
}

function PlanSummary({
	subscription,
	retry,
}: {
	subscription: OrganizationSubscriptionDto;
	retry: ReactNode;
}) {
	const { label, variant, detail } = describeSubscription(subscription);
	const { plan, billing } = subscription;

	return (
		<div className="grid gap-1">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium text-lg">
					{plan ? getPlanName(plan) : "No plan"}
				</span>
				<Badge variant={variant}>{label}</Badge>
			</div>
			{billing && <p className="text-sm">{formatPrice(billing)}</p>}
			{detail ? (
				<p className="text-muted-foreground text-sm">{detail}</p>
			) : (
				<div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
					<p>Billing details are unavailable right now.</p>
					{retry}
				</div>
			)}
		</div>
	);
}
