import {
	type IncomingTransferDto,
	PLAN_ORGANIZATION_LIMITS,
	PLAN_SLUGS,
	type PlanSlug,
} from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	acceptTransfer,
	accountKeys,
	checkoutForTransfer,
} from "#/modules/account-dashboard/lib/account-queries";
import {
	changePlan,
	fetchSubscription,
	invalidateSubscription,
	subscriptionQuery,
} from "#/modules/account-dashboard/lib/billing-queries";
import { describeTiming } from "#/modules/account-dashboard/lib/plan-change";
import { formatPrice } from "#/modules/account-dashboard/lib/subscription-status";
import {
	type AcceptPath,
	acceptPathFor,
} from "#/modules/account-dashboard/lib/transfer-accept";
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
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { invalidateOrganizations } from "#/shared/lib/organizations";
import { getPlanName, PLAN_PRICES } from "#/shared/lib/plans";
import { pollUntil } from "#/shared/lib/poll-until";

const organizationCount = (count: number) =>
	count === 1 ? "1 organization" : `${count} organizations`;

/** Says what accepting takes (a free slot, an upgrade or a new plan) before it happens. */
export function AcceptTransferDialog({
	transfer,
	open,
	onOpenChange,
}: {
	transfer: IncomingTransferDto;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const { data: subscription, isError } = useQuery({
		...subscriptionQuery,
		enabled: open,
	});
	const path = subscription ? acceptPathFor(subscription) : null;
	const [plan, setPlan] = useState<PlanSlug>("starter");
	const name = transfer.organization.name;

	const accept = useMutation({
		mutationFn: async (path: AcceptPath) => {
			if (path.kind === "upgrade") {
				const res = await changePlan({ plan: path.to });
				if (!res.isSuccess) throw new Error(res.message);
				const upgraded =
					res.data.plan === path.to ||
					(await pollUntil(
						fetchSubscription,
						(subscription) => subscription.plan === path.to,
						{ attempts: 10 },
					));
				if (!upgraded)
					throw new Error(
						`Your upgrade to ${getPlanName(path.to)} is still being confirmed. Accept again once Billing shows it.`,
					);
			}
			const res = await acceptTransfer(transfer.id);
			if (!res.isSuccess) throw new Error(res.message);
			if (res.data.status === "completed") return "completed";
			if (path.kind !== "buy")
				throw new Error("Your plan changed meanwhile; review the offer again.");
			await checkoutForTransfer(plan, transfer.id);
			return "checkout";
		},
		onSuccess: (outcome) => {
			if (outcome !== "completed") return;
			toast.add({ type: "success", title: `${name} is yours`, timeout: 4_000 });
			onOpenChange(false);
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: accountKeys.incomingTransfers,
			});
			void invalidateOrganizations(queryClient);
			void invalidateSubscription(queryClient);
		},
	});
	// the tab is leaving for Polar's checkout
	const busy = accept.isPending || accept.data === "checkout";

	const handleOpenChange = (next: boolean) => {
		if (busy) return;
		onOpenChange(next);
		if (!next) accept.reset();
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Take over {name}</DialogTitle>
					<DialogDescription>
						{transfer.from.name} stays on as an admin. Nothing changes on their
						plan.
					</DialogDescription>
				</DialogHeader>

				{isError ? (
					<FieldError>Couldn't load your plan. Try again.</FieldError>
				) : !path ? (
					<div className="grid gap-2">
						<Skeleton className="h-4 w-full rounded-md" />
						<Skeleton className="h-4 w-2/3 rounded-md" />
					</div>
				) : (
					<AcceptPathDetails
						path={path}
						name={name}
						plan={plan}
						onPlanChange={setPlan}
						disabled={busy}
					/>
				)}

				{accept.isError && <FieldError>{accept.error.message}</FieldError>}

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />} disabled={busy}>
						Cancel
					</DialogClose>
					{path?.kind === "suspended" ? (
						<Button render={<Link to="/account/billing" />}>
							Go to Billing
						</Button>
					) : (
						path &&
						path.kind !== "full" && (
							<Button disabled={busy} onClick={() => accept.mutate(path)}>
								{busy ? "Accepting…" : confirmLabel(path)}
							</Button>
						)
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const confirmLabel = (path: AcceptPath) => {
	switch (path.kind) {
		case "upgrade":
			return `Upgrade to ${getPlanName(path.to)} and accept`;
		case "buy":
			return "Continue to payment";
		default:
			return "Accept";
	}
};

function AcceptPathDetails({
	path,
	name,
	plan,
	onPlanChange,
	disabled,
}: {
	path: AcceptPath;
	name: string;
	plan: PlanSlug;
	onPlanChange: (plan: PlanSlug) => void;
	disabled: boolean;
}) {
	switch (path.kind) {
		case "slot":
			return (
				<p className="text-muted-foreground">
					{name} takes one of your free organization slots and gets your{" "}
					{getPlanName(path.plan)} plan's features.
				</p>
			);
		case "upgrade":
			return (
				<div className="grid gap-1 text-muted-foreground">
					<p>
						Your {getPlanName(path.from)} plan has no free organization slot.
						Accepting upgrades it to {getPlanName(path.to)}, which keeps up to{" "}
						{organizationCount(PLAN_ORGANIZATION_LIMITS[path.to])} active, and{" "}
						{name} takes the new slot.
					</p>
					<p>{describeTiming("upgrade", null)}</p>
				</div>
			);
		case "full":
			return (
				<p className="text-muted-foreground">
					Your {getPlanName(path.plan)} plan has no free organization slot, and
					there's no larger plan. Deactivate one of your organizations, then
					accept.
				</p>
			);
		case "suspended":
			return (
				<p className="text-muted-foreground">
					Your plan is suspended. Resume it on Billing, then accept.
				</p>
			);
		case "buy":
			return (
				<div className="grid gap-3">
					<p className="text-muted-foreground">
						To own {name} you need a plan. Choose one; {name} becomes yours as
						soon as the payment completes. If the offer closes first, you keep
						the plan.
					</p>
					<fieldset className="grid gap-2" disabled={disabled}>
						<legend className="sr-only">Plan</legend>
						{PLAN_SLUGS.map((slug) => (
							<label
								key={slug}
								className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors has-checked:border-primary has-checked:bg-primary/5 has-disabled:cursor-not-allowed"
							>
								<input
									type="radio"
									name="plan"
									value={slug}
									className="accent-primary"
									checked={plan === slug}
									onChange={() => onPlanChange(slug)}
								/>
								<span className="flex flex-1 flex-wrap items-center justify-between gap-2">
									<span className="grid">
										<span className="font-medium">{getPlanName(slug)}</span>
										<span className="text-muted-foreground">
											Up to {organizationCount(PLAN_ORGANIZATION_LIMITS[slug])}
										</span>
									</span>
									<span className="text-muted-foreground">
										{formatPrice({
											amount: PLAN_PRICES[slug].month * 100,
											currency: "USD",
											interval: "month",
											intervalCount: 1,
										})}
									</span>
								</span>
							</label>
						))}
					</fieldset>
				</div>
			);
	}
}
