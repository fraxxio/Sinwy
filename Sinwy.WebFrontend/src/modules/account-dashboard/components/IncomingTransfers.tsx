import type { IncomingTransferDto } from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AcceptTransferDialog } from "#/modules/account-dashboard/components/AcceptTransferDialog";
import {
	accountKeys,
	declineTransfer,
	incomingTransfersQuery,
} from "#/modules/account-dashboard/lib/account-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { formatDay } from "#/shared/lib/date";

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
	const [accepting, setAccepting] = useState(false);

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

	const busy = accepting || decline.isPending;

	return (
		<li className="grid gap-2 py-3 first:pt-0 last:pb-0">
			<div className="flex items-center justify-between gap-4">
				<div className="grid gap-0.5 text-sm">
					<span className="font-medium">{transfer.organization.name}</span>
					<span className="text-xs text-muted-foreground">
						{transfer.from.name} offers you ownership. As the owner it runs on
						your plan and takes one of its organization slots.
						{transfer.status === "accepted" &&
							" You accepted; it moves to you once your plan's payment completes."}{" "}
						Open until {formatDay(transfer.expiresAt)}.
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
					<Button size="sm" disabled={busy} onClick={() => setAccepting(true)}>
						Accept
					</Button>
				</div>
			</div>
			{decline.isError && <FieldError>{decline.error.message}</FieldError>}
			<AcceptTransferDialog
				transfer={transfer}
				open={accepting}
				onOpenChange={setAccepting}
			/>
		</li>
	);
}
