import {
	type Feature,
	PLAN_SLUGS,
	type PlanSlug,
	type SubscriptionBillingDto,
} from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
	billingKeys,
	changePlan,
	fetchSubscription,
} from "#/modules/account-dashboard/lib/billing-queries";
import {
	describePlanChange,
	describeTiming,
	organizationsToKeep,
} from "#/modules/account-dashboard/lib/plan-change";
import { formatPrice } from "#/modules/account-dashboard/lib/subscription-status";
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
import { formatDay } from "#/shared/lib/date";
import {
	invalidateOrganizations,
	organizationsQuery,
} from "#/shared/lib/organizations";
import { FEATURE_NAMES, getPlanName, PLAN_PRICES } from "#/shared/lib/plans";
import { pollUntil } from "#/shared/lib/poll-until";
import { cn } from "#/shared/lib/utils";

const featureNames = (features: readonly Feature[]) =>
	features.map((feature) => FEATURE_NAMES[feature]).join(", ");

type PlanChange = { plan: PlanSlug; keep?: string[] | undefined };

export function ChangePlanDialog({
	current,
	scheduled,
	billing,
	open,
	onOpenChange,
}: {
	current: PlanSlug;
	/** The plan a pending downgrade switches to. */
	scheduled: PlanSlug | null;
	/** From Polar; null when billing details are unavailable. */
	billing: Pick<
		SubscriptionBillingDto,
		"interval" | "intervalCount" | "currentPeriodEnd"
	> | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [target, setTarget] = useState<PlanSlug | null>(null);
	const [keep, setKeep] = useState<string[]>([]);
	const { data: organizations } = useQuery({
		...organizationsQuery,
		enabled: open,
	});
	const active =
		organizations?.filter((org) => org.isOwner && org.status === "active") ??
		[];
	const subscriptionKey = billingKeys.subscription;
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const change = useMutation({
		mutationFn: async ({ plan, keep }: PlanChange) => {
			const res = await changePlan({ plan, keep });
			if (!res.isSuccess) throw new Error(res.message);
			// a downgrade answers with Polar's pending update at once
			if (res.data.plan === plan || res.data.pendingChange?.plan === plan)
				return res.data;
			// the response lags when a newer webhook already owns the projection
			return (
				(await pollUntil(
					fetchSubscription,
					(subscription) => subscription.plan === plan,
					{ attempts: 10, isCancelled: () => !mounted.current },
				)) ?? res.data
			);
		},
		onSuccess: (subscription, { plan }) => {
			if (
				subscription.plan === plan ||
				subscription.pendingChange?.plan === plan
			)
				queryClient.setQueryData(subscriptionKey, subscription);
			else void queryClient.invalidateQueries({ queryKey: subscriptionKey });
			void invalidateOrganizations(queryClient);
		},
		// a refused change usually means Polar's state moved (canceled, revoked);
		// not awaited, so the error shows without waiting for the refetch
		onError: () =>
			void queryClient.invalidateQueries({ queryKey: subscriptionKey }),
	});

	const close = () => {
		onOpenChange(false);
		setTarget(null);
		setKeep([]);
		change.reset();
	};

	const handleOpenChange = (next: boolean) => {
		if (change.isPending) return;
		if (next) onOpenChange(true);
		else close();
	};

	// mutate's own callbacks skip an unmounted dialog, so leaving the page
	// mid-switch never navigates back here
	const submit = (request: PlanChange) =>
		change.mutate(request, {
			onSuccess: (subscription) => {
				const { plan } = request;
				const pending = subscription.pendingChange;
				toast.add(
					subscription.plan === plan
						? {
								type: "success",
								title: `Switched to ${getPlanName(plan)}`,
								timeout: 4_000,
							}
						: pending?.plan === plan
							? {
									type: "success",
									title: `Switches to ${getPlanName(plan)} on ${formatDay(pending.appliesAt)}`,
									timeout: 4_000,
								}
							: {
									type: "info",
									title: `Switching to ${getPlanName(plan)}`,
									description:
										"Polar accepted the change. It shows here once it's confirmed.",
								},
				);
				close();
			},
		});

	// the catalogue only lists monthly and yearly prices
	const period =
		billing?.intervalCount === 1 &&
		(billing.interval === "month" || billing.interval === "year")
			? billing.interval
			: null;
	const selected = target && describePlanChange(current, target);
	const periodEnd = billing?.currentPeriodEnd ?? null;
	const keepCount =
		target && selected?.direction === "downgrade"
			? organizationsToKeep(active.length, target)
			: null;
	const toggleKeep = (id: string, checked: boolean) => {
		setKeep((prev) =>
			checked ? [...prev, id] : prev.filter((kept) => kept !== id),
		);
		change.reset();
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Change plan</DialogTitle>
					<DialogDescription>
						You're on {getPlanName(current)}.
						{period && " Prices are before tax."}
					</DialogDescription>
				</DialogHeader>

				<fieldset className="grid gap-2" disabled={change.isPending}>
					<legend className="sr-only">Plan</legend>
					{PLAN_SLUGS.map((slug) => {
						const isCurrent = slug === current;
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
										setKeep([]);
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
											{slug === scheduled && (
												<Badge variant="outline">Scheduled</Badge>
											)}
										</span>
										{period && (
											<span className="text-muted-foreground">
												{formatPrice({
													amount: PLAN_PRICES[slug][period] * 100,
													currency: "USD",
													interval: period,
													intervalCount: 1,
												})}
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
						<p>{describeTiming(selected.direction, periodEnd)}</p>
						{selected.lost.length > 0 && (
							<p>
								Your organizations lose access to {featureNames(selected.lost)}{" "}
								then.
							</p>
						)}
					</div>
				)}

				{target && keepCount !== null && (
					<fieldset className="grid gap-2" disabled={change.isPending}>
						<legend className="mb-2 font-medium">
							Choose{" "}
							{keepCount === 1 ? "the organization" : `up to ${keepCount}`} to
							keep active
						</legend>
						<p className="text-muted-foreground">
							{getPlanName(target)} keeps {keepCount}{" "}
							{keepCount === 1 ? "organization" : "organizations"} active. The
							others become inactive
							{periodEnd ? ` on ${formatDay(periodEnd)}` : " at renewal"}; their
							data is kept.
						</p>
						{active.map((org) => {
							const checked = keep.includes(org.id);
							return (
								<label
									key={org.id}
									className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 has-checked:border-primary has-disabled:cursor-not-allowed"
								>
									<input
										type="checkbox"
										className="accent-primary"
										checked={checked}
										disabled={!checked && keep.length >= keepCount}
										onChange={(event) =>
											toggleKeep(org.id, event.target.checked)
										}
									/>
									{org.name}
								</label>
							);
						})}
					</fieldset>
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
						disabled={
							!target ||
							change.isPending ||
							(selected?.direction === "downgrade" && !organizations) ||
							(keepCount !== null && keep.length === 0)
						}
						onClick={() =>
							target &&
							submit({
								plan: target,
								keep: keepCount !== null ? keep : undefined,
							})
						}
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
