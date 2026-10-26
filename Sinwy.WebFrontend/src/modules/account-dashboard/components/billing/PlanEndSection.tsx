import type {
	AccountSubscriptionDto,
	SubscriptionBillingDto,
} from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	billingKeys,
	runSubscriptionAction,
	type SubscriptionAction,
	subscriptionQuery,
} from "#/modules/account-dashboard/lib/billing-queries";
import { PLAN_END_BLOCKER_MESSAGES } from "#/modules/account-dashboard/lib/subscription-status";
import { SettingsSection } from "#/shared/components/SettingsSection";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/shared/components/ui/alert-dialog";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { formatDay } from "#/shared/lib/date";
import { invalidateOrganizations } from "#/shared/lib/organizations";

type PlanEnd = {
	schedule: SubscriptionAction;
	undo: SubscriptionAction;
	isPending: (billing: SubscriptionBillingDto) => boolean;
	endsOn: (billing: SubscriptionBillingDto) => string;
	title: string;
	description: string;
	pendingTitle: string;
	dialogTitle: string;
	/** Shown under the affected organizations. */
	dialogNote: string;
	confirm: string;
	scheduledToast: string;
	undoneToast: string;
};

const PLAN_ENDS = {
	suspend: {
		schedule: "suspend",
		undo: "unsuspend",
		isPending: (billing) => billing.pauseAtPeriodEnd,
		endsOn: (billing) => billing.currentPeriodEnd,
		title: "Suspend plan",
		description:
			"Take every organization you own offline at the end of the paid period, then resume whenever you're ready, without a new checkout.",
		pendingTitle: "Suspension scheduled",
		dialogTitle: "Suspend your plan?",
		dialogNote:
			"Resume it any time after that. Polar charges your saved payment method for a new period right away; there's no new checkout.",
		confirm: "Suspend",
		scheduledToast: "Suspension scheduled",
		undoneToast: "Suspension canceled",
	},
	cancel: {
		schedule: "cancel",
		undo: "uncancel",
		isPending: (billing) => billing.cancelAtPeriodEnd,
		endsOn: (billing) => billing.endsAt ?? billing.currentPeriodEnd,
		title: "Cancel plan",
		description:
			"End your plan at the end of the paid period. Every organization you own goes offline then, and coming back takes a new checkout.",
		pendingTitle: "Cancellation scheduled",
		dialogTitle: "Cancel your plan?",
		dialogNote:
			"To bring them back later, choose a plan again on this page; they keep their place.",
		confirm: "Cancel plan",
		scheduledToast: "Cancellation scheduled",
		undoneToast: "Cancellation undone",
	},
} satisfies Record<string, PlanEnd>;

/** Suspend or cancel: both take every owned organization offline at the period end (D8, D9). */
export function PlanEndSection({ kind }: { kind: keyof typeof PLAN_ENDS }) {
	const config: PlanEnd = PLAN_ENDS[kind];
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const { data } = useQuery(subscriptionQuery);

	const action = useMutation({
		mutationFn: async (schedule: boolean) => {
			const res = await runSubscriptionAction(
				schedule ? config.schedule : config.undo,
			);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		onSuccess: (subscription: AccountSubscriptionDto, schedule) => {
			queryClient.setQueryData(billingKeys.subscription, subscription);
			void invalidateOrganizations(queryClient);
			setOpen(false);
			toast.add({
				type: "success",
				title: schedule ? config.scheduledToast : config.undoneToast,
				timeout: 4_000,
			});
		},
		// a refusal usually means Polar's state moved; show what it is now
		onError: () =>
			void queryClient.invalidateQueries({
				queryKey: billingKeys.subscription,
			}),
	});

	const billing = data?.billing ?? null;
	const endsOn = billing && formatDay(config.endsOn(billing));

	if (billing && config.isPending(billing))
		return (
			<SettingsSection
				id={kind}
				title={config.pendingTitle}
				description={`Your organizations go offline on ${endsOn}. Until then everything keeps working, and you can still undo it.`}
				action={
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={action.isPending}
						onClick={() => action.mutate(false)}
					>
						{action.isPending ? "Undoing…" : "Undo"}
					</Button>
				}
			>
				{action.isError && <FieldError>{action.error.message}</FieldError>}
			</SettingsSection>
		);

	const blocker = data?.blockers[kind] ?? null;
	const affected = data?.activeOrganizations ?? [];

	return (
		<SettingsSection
			id={kind}
			title={config.title}
			description={config.description}
			action={
				<AlertDialog
					open={open}
					onOpenChange={(next) => {
						if (action.isPending) return;
						setOpen(next);
						if (!next) action.reset();
					}}
				>
					<AlertDialogTrigger
						render={
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={!data || blocker !== null}
							/>
						}
					>
						{config.confirm}
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{config.dialogTitle}</AlertDialogTitle>
							<AlertDialogDescription>
								{affected.length > 0
									? `These organizations stay active until ${endsOn}, then go offline: members lose access and public pages stop.`
									: `None of your organizations is active, so nothing goes offline on ${endsOn}.`}{" "}
								The rest of this period isn't refunded.
							</AlertDialogDescription>
						</AlertDialogHeader>
						{affected.length > 0 && (
							<ul className="list-disc space-y-1 pl-5 text-sm">
								{affected.map(({ id, name }) => (
									<li key={id}>{name}</li>
								))}
							</ul>
						)}
						<p className="text-muted-foreground text-sm">{config.dialogNote}</p>
						{action.isError && <FieldError>{action.error.message}</FieldError>}
						<AlertDialogFooter>
							<AlertDialogCancel disabled={action.isPending}>
								Keep plan
							</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								disabled={action.isPending}
								onClick={() => action.mutate(true)}
							>
								{action.isPending
									? "Scheduling…"
									: `${config.confirm} on ${endsOn}`}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			}
		>
			{blocker && (
				<p className="text-muted-foreground text-sm">
					{PLAN_END_BLOCKER_MESSAGES[blocker]}
				</p>
			)}
		</SettingsSection>
	);
}
