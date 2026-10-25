import type { IncomingTransferDto } from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	acceptTransfer,
	accountKeys,
	declineTransfer,
	incomingTransfersQuery,
} from "#/modules/account-dashboard/lib/account-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { formatDay } from "#/shared/lib/date";
import { organizationsQuery } from "#/shared/lib/organizations";
import { getPlanName } from "#/shared/lib/plans";

/** Organizations offered to the caller; nothing renders while there are none. */
export function IncomingTransfers() {
	const { data: transfers } = useQuery(incomingTransfersQuery);
	if (!transfers?.length) return null;

	return (
		<ContentBox className="mb-6">
			<h2 className="mb-3 font-heading font-medium text-base">
				Ownership offers
			</h2>
			<ul className="divide-y">
				{transfers.map((transfer) => (
					<IncomingTransferRow key={transfer.id} transfer={transfer} />
				))}
			</ul>
		</ContentBox>
	);
}

function IncomingTransferRow({ transfer }: { transfer: IncomingTransferDto }) {
	const queryClient = useQueryClient();

	const accept = useMutation({
		mutationFn: async () => {
			const res = await acceptTransfer(transfer.id);
			if (!res.isSuccess) throw new Error(res.message);
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: accountKeys.incomingTransfers,
			});
			void queryClient.invalidateQueries({
				queryKey: organizationsQuery.queryKey,
			});
		},
	});

	const decline = useMutation({
		mutationFn: async () => {
			const res = await declineTransfer(transfer.id);
			if (!res.isSuccess) throw new Error(res.message);
		},
		onSettled: () =>
			void queryClient.invalidateQueries({
				queryKey: accountKeys.incomingTransfers,
			}),
	});

	const plan = transfer.organization.plan;
	const busy = accept.isPending || accept.isSuccess || decline.isPending;

	return (
		<li className="grid gap-2 py-3 first:pt-0 last:pb-0">
			<div className="flex items-center justify-between gap-4">
				<div className="grid gap-0.5 text-sm">
					<span className="font-medium">{transfer.organization.name}</span>
					<span className="text-xs text-muted-foreground">
						{transfer.from.name} offers you ownership
						{plan ? ` on the ${getPlanName(plan)} plan` : ""}. You'll pay for it
						with your own payment method. Open until{" "}
						{formatDay(transfer.expiresAt)}.
					</span>
				</div>
				<div className="flex shrink-0 gap-2">
					<Button
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={() => decline.mutate()}
					>
						{decline.isPending ? "Declining…" : "Decline"}
					</Button>
					<Button size="sm" disabled={busy} onClick={() => accept.mutate()}>
						{accept.isPending || accept.isSuccess ? "Accepting…" : "Accept"}
					</Button>
				</div>
			</div>
			{accept.isError && <FieldError>{accept.error.message}</FieldError>}
			{decline.isError && <FieldError>{decline.error.message}</FieldError>}
		</li>
	);
}
