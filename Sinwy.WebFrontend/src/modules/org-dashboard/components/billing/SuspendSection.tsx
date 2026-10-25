import type { OrganizationSubscriptionDto } from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
	billingKeys,
	runSubscriptionAction,
	subscriptionQuery,
} from "#/modules/org-dashboard/lib/billing-queries";
import { suspensionBlocker } from "#/modules/org-dashboard/lib/subscription-status";
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
import { handleOrganizationInactive } from "#/shared/lib/auth/organization-inactive";
import { formatDay } from "#/shared/lib/date";
import { invalidateOrganizations } from "#/shared/lib/organizations";

export function SuspendSection({
	organizationId,
	organizationName,
}: {
	organizationId: string;
	organizationName: string;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const { data } = useQuery(subscriptionQuery(organizationId));
	const subscriptionKey = billingKeys.subscription(organizationId);

	const action = useMutation({
		mutationFn: async (suspend: boolean) => {
			const res = await runSubscriptionAction(
				organizationId,
				suspend ? "suspend" : "unsuspend",
			);
			if (!res.isSuccess) {
				handleOrganizationInactive(res, router, queryClient);
				throw new Error(res.message);
			}
			return res.data;
		},
		onSuccess: (subscription: OrganizationSubscriptionDto, suspend) => {
			queryClient.setQueryData(subscriptionKey, subscription);
			void invalidateOrganizations(queryClient);
			setOpen(false);
			toast.add({
				type: "success",
				title: suspend ? "Suspension scheduled" : "Suspension canceled",
				timeout: 4_000,
			});
		},
		// a refusal usually means Polar's state moved; show what it is now
		onError: () =>
			void queryClient.invalidateQueries({ queryKey: subscriptionKey }),
	});

	const billing = data?.billing ?? null;
	const periodEnd = billing && formatDay(billing.currentPeriodEnd);

	if (billing?.pauseAtPeriodEnd)
		return (
			<SettingsSection
				id="suspend"
				title="Suspension scheduled"
				description={`${organizationName} goes offline on ${periodEnd}. Until then everything keeps working, and you can still undo it.`}
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

	const blocker = data ? suspensionBlocker(billing) : null;

	return (
		<SettingsSection
			id="suspend"
			title="Suspend organization"
			description="Take the organization offline at the end of the paid period, then resume it whenever you're ready, without a new checkout."
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
						Suspend
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Suspend {organizationName}?</AlertDialogTitle>
							<AlertDialogDescription>
								It stays active until {periodEnd}, then goes offline: members
								lose access and its public pages stop. The rest of this period
								isn't refunded.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<p className="text-muted-foreground text-sm">
							Resume it any time after that. Polar charges your saved payment
							method for a new period right away; there's no new checkout.
						</p>
						{action.isError && <FieldError>{action.error.message}</FieldError>}
						<AlertDialogFooter>
							<AlertDialogCancel disabled={action.isPending}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								disabled={action.isPending}
								onClick={() => action.mutate(true)}
							>
								{action.isPending ? "Scheduling…" : `Suspend on ${periodEnd}`}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			}
		>
			{blocker && <p className="text-muted-foreground text-sm">{blocker}</p>}
		</SettingsSection>
	);
}
