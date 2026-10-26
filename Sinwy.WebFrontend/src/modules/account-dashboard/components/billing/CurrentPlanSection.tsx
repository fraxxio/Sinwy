import type {
	AccountSubscriptionDto,
	PendingPlanChangeDto,
	PlanSlug,
} from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { ChangePlanDialog } from "#/modules/account-dashboard/components/billing/ChangePlanDialog";
import {
	billingKeys,
	cancelPlanChange,
	subscriptionQuery,
} from "#/modules/account-dashboard/lib/billing-queries";
import {
	describeSubscription,
	formatPrice,
} from "#/modules/account-dashboard/lib/subscription-status";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { formatDay } from "#/shared/lib/date";
import { invalidateOrganizations } from "#/shared/lib/organizations";
import { getPlanName } from "#/shared/lib/plans";

export function CurrentPlanSection({
	changePlanOpen,
	onChangePlanOpenChange,
}: {
	changePlanOpen: boolean;
	onChangePlanOpenChange: (open: boolean) => void;
}) {
	const { data, isPending, isError, isFetching, refetch } =
		useQuery(subscriptionQuery);

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
	// Polar refuses plan changes on a subscription that is canceled or set to
	// cancel; the backend refuses one set to suspend
	const suspending = data?.billing?.pauseAtPeriodEnd === true;
	const canChangePlan =
		plan !== null &&
		!suspending &&
		!data?.billing?.cancelAtPeriodEnd &&
		data?.billing?.subscriptionStatus !== "canceled";
	const cannotChangeReason = !data
		? null
		: plan === null
			? "There's no current plan to change from."
			: suspending
				? "Your plan is set to suspend. Undo that first."
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
			description="Every organization you own runs on it."
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
					current={plan}
					scheduled={data?.pendingChange?.plan ?? null}
					billing={data?.billing ?? null}
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
	subscription: AccountSubscriptionDto;
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
			{plan && (
				<p className="text-sm">
					{subscription.activeOrganizations} of {subscription.organizationLimit}{" "}
					organizations active.{" "}
					<Link
						to="/account/organizations"
						className="underline underline-offset-4"
					>
						Manage organizations
					</Link>
				</p>
			)}
			{plan && subscription.pendingChange && (
				<PendingChange current={plan} change={subscription.pendingChange} />
			)}
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

function PendingChange({
	current,
	change,
}: {
	current: PlanSlug;
	change: PendingPlanChangeDto;
}) {
	const queryClient = useQueryClient();
	const cancel = useMutation({
		mutationFn: async () => {
			const res = await cancelPlanChange();
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		onSuccess: (subscription) => {
			queryClient.setQueryData(billingKeys.subscription, subscription);
			void invalidateOrganizations(queryClient);
			toast.add({
				type: "success",
				title: `You stay on ${getPlanName(current)}`,
				timeout: 4_000,
			});
		},
		onError: () =>
			void queryClient.invalidateQueries({
				queryKey: billingKeys.subscription,
			}),
	});
	const names = change.deactivates.map(({ name }) => name).join(", ");

	return (
		<div className="my-1 grid gap-2 rounded-xl border border-dashed p-3 text-sm">
			<p>
				Switches to{" "}
				<span className="font-medium">{getPlanName(change.plan)}</span> on{" "}
				{formatDay(change.appliesAt)}.
				{names &&
					` ${names} ${change.deactivates.length === 1 ? "becomes" : "become"} inactive then.`}
			</p>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={cancel.isPending}
					onClick={() => cancel.mutate()}
				>
					{cancel.isPending ? "Canceling…" : `Stay on ${getPlanName(current)}`}
				</Button>
				{cancel.isError && <FieldError>{cancel.error.message}</FieldError>}
			</div>
		</div>
	);
}
