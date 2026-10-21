import {
	type Feature,
	PLAN_SLUGS,
	type PlanSlug,
	type SubscriptionBillingDto,
} from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
	billingKeys,
	changePlan,
	fetchSubscription,
} from "#/modules/org-dashboard/lib/billing-queries";
import {
	describePlanChange,
	PRORATION_COPY,
} from "#/modules/org-dashboard/lib/plan-change";
import { plans } from "#/modules/organizations/components/PlanCards";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/shared/components/ui/dialog";
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { handleOrganizationInactive } from "#/shared/lib/auth/organization-inactive";
import { FEATURE_NAMES, getPlanName } from "#/shared/lib/plans";
import { pollUntil } from "#/shared/lib/poll-until";
import { cn } from "#/shared/lib/utils";

const featureNames = (features: readonly Feature[]) =>
	features.map((feature) => FEATURE_NAMES[feature]).join(", ");

export function ChangePlanDialog({
	organizationId,
	current,
	interval,
	open,
	onOpenChange,
}: {
	organizationId: string;
	current: PlanSlug;
	/** From Polar; null when billing details are unavailable. */
	interval: SubscriptionBillingDto["interval"] | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const [target, setTarget] = useState<PlanSlug | null>(null);
	const subscriptionKey = billingKeys.subscription(organizationId);

	const change = useMutation({
		mutationFn: async (plan: PlanSlug) => {
			const res = await changePlan(organizationId, { plan });
			if (!res.isSuccess) {
				handleOrganizationInactive(res, router);
				throw new Error(res.message);
			}
			if (res.data.plan === plan) return res.data;
			// the response lags when a newer webhook already owns the projection
			return (
				(await pollUntil(
					() => fetchSubscription(organizationId),
					(subscription) => subscription.plan === plan,
					{ attempts: 10 },
				)) ?? res.data
			);
		},
		onSuccess: (subscription, plan) => {
			if (subscription.plan === plan)
				queryClient.setQueryData(subscriptionKey, subscription);
			else void queryClient.invalidateQueries({ queryKey: subscriptionKey });
			void router.invalidate();
			toast.add({
				type: "success",
				title: `Switched to ${getPlanName(plan)}`,
				timeout: 4_000,
			});
			onOpenChange(false);
		},
		// a refused change usually means Polar's state moved (canceled, revoked)
		onError: () => queryClient.invalidateQueries({ queryKey: subscriptionKey }),
	});

	const handleOpenChange = (next: boolean) => {
		if (change.isPending) return;
		onOpenChange(next);
		if (next) return;
		setTarget(null);
		change.reset();
	};

	const yearly = interval === "year";
	const selected = target && describePlanChange(current, target);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Change plan</DialogTitle>
					<DialogDescription>
						You're on {getPlanName(current)}. Prices are before tax.
					</DialogDescription>
				</DialogHeader>

				<fieldset className="grid gap-2" disabled={change.isPending}>
					<legend className="sr-only">Plan</legend>
					{PLAN_SLUGS.map((slug) => {
						const isCurrent = slug === current;
						const entry = plans.find((p) => p.slug === slug);
						const { gained, lost } = describePlanChange(current, slug);
						return (
							<label
								key={slug}
								className={cn(
									"flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors has-checked:border-primary has-checked:bg-primary/5 has-disabled:cursor-not-allowed",
									isCurrent && "bg-muted/50",
								)}
							>
								<input
									type="radio"
									name="plan"
									value={slug}
									className="mt-1 accent-primary"
									checked={target === slug}
									disabled={isCurrent}
									onChange={() => {
										setTarget(slug);
										change.reset();
									}}
								/>
								<div className="grid flex-1 gap-1">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="flex items-center gap-2 font-medium">
											{getPlanName(slug)}
											{isCurrent && (
												<Badge variant="secondary">Current plan</Badge>
											)}
										</span>
										{entry && (
											<span className="text-muted-foreground">
												${yearly ? entry.yearlyPrice : entry.price} /{" "}
												{yearly ? "year" : "month"}
											</span>
										)}
									</div>
									{gained.length > 0 && (
										<p className="text-muted-foreground">
											Adds {featureNames(gained)}
										</p>
									)}
									{lost.length > 0 && (
										<p className="text-muted-foreground">
											Removes {featureNames(lost)}
										</p>
									)}
								</div>
							</label>
						);
					})}
				</fieldset>

				{selected && (
					<div className="grid gap-1 text-muted-foreground">
						<p>{PRORATION_COPY[selected.direction]}</p>
						{selected.lost.length > 0 && (
							<p>
								Your team loses access to {featureNames(selected.lost)} right
								away.
							</p>
						)}
					</div>
				)}

				{change.isError && <FieldError>{change.error.message}</FieldError>}

				<DialogFooter>
					<DialogClose
						render={<Button variant="outline" />}
						disabled={change.isPending}
					>
						Cancel
					</DialogClose>
					<Button
						type="button"
						disabled={!target || change.isPending}
						onClick={() => target && change.mutate(target)}
					>
						{change.isPending
							? "Switching…"
							: target
								? `Switch to ${getPlanName(target)}`
								: "Switch plan"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
