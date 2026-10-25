import { TRANSFER_OFFER_DAYS } from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	cancelTransfer,
	offerTransfer,
	openTransferQuery,
	transferCandidatesQuery,
	transferKeys,
} from "#/modules/org-dashboard/lib/transfer-queries";
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
import { Field, FieldError, FieldLabel } from "#/shared/components/ui/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/shared/components/ui/select";
import { toast } from "#/shared/components/ui/toast";
import { authClient } from "#/shared/lib/auth/auth-client";
import { formatDay } from "#/shared/lib/date";

export function TransferSection({
	organizationId,
	organizationName,
}: {
	organizationId: string;
	organizationName: string;
}) {
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const ownerUserId = session?.user.id ?? "";
	const transfer = useQuery(openTransferQuery(organizationId));
	const candidates = useQuery({
		...transferCandidatesQuery(organizationId, ownerUserId),
		enabled: ownerUserId !== "",
	});
	const [open, setOpen] = useState(false);
	const [userId, setUserId] = useState("");
	const openKey = transferKeys.open(organizationId);

	const offer = useMutation({
		mutationFn: async () => {
			const res = await offerTransfer(organizationId, { userId });
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		onSuccess: (offered) => {
			queryClient.setQueryData(openKey, offered);
			setOpen(false);
			setUserId("");
			toast.add({
				type: "success",
				title: `Offer sent to ${offered.to.name}`,
				timeout: 4_000,
			});
		},
	});

	const cancel = useMutation({
		mutationFn: async () => {
			const res = await cancelTransfer(organizationId);
			if (!res.isSuccess) throw new Error(res.message);
		},
		onSettled: () => void queryClient.invalidateQueries({ queryKey: openKey }),
	});

	const pending = transfer.data;
	if (pending)
		return (
			<SettingsSection
				id="transfer"
				title="Ownership transfer pending"
				description={
					pending.status === "accepted"
						? `${pending.to.name} accepted and is checking out. ${organizationName} becomes theirs once the payment goes through.`
						: `Offered to ${pending.to.name} (${pending.to.email}) until ${formatDay(pending.expiresAt)}. Plan changes and suspension wait until it's settled.`
				}
				action={
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={cancel.isPending}
						onClick={() => cancel.mutate()}
					>
						{cancel.isPending ? "Canceling…" : "Cancel offer"}
					</Button>
				}
			>
				{cancel.isError && <FieldError>{cancel.error.message}</FieldError>}
			</SettingsSection>
		);

	const options = (candidates.data ?? []).map((member) => ({
		value: member.userId,
		label: `${member.name} (${member.email})`,
	}));
	const chosen = candidates.data?.find((member) => member.userId === userId);

	return (
		<SettingsSection
			id="transfer"
			title="Transfer ownership"
			description={`Hand ${organizationName} to another member. They pay for its plan from then on; you stay on as an admin without billing access.`}
			action={
				<AlertDialog
					open={open}
					onOpenChange={(next) => {
						if (offer.isPending) return;
						setOpen(next);
						if (!next) offer.reset();
					}}
				>
					<AlertDialogTrigger
						render={
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={transfer.isPending || options.length === 0}
							/>
						}
					>
						Transfer
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Transfer {organizationName}?</AlertDialogTitle>
							<AlertDialogDescription>
								The member has {TRANSFER_OFFER_DAYS} days to accept and check
								out with their own payment method. When their payment goes
								through, your subscription ends and the unused time is refunded.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<Field className="gap-2">
							<FieldLabel htmlFor="transfer-recipient">New owner</FieldLabel>
							<Select
								id="transfer-recipient"
								items={options}
								value={userId}
								onValueChange={(value) => setUserId(value ?? "")}
							>
								<SelectTrigger>
									<SelectValue placeholder="Choose a member" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{options.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						{offer.isError && <FieldError>{offer.error.message}</FieldError>}
						<AlertDialogFooter>
							<AlertDialogCancel disabled={offer.isPending}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								disabled={!chosen || offer.isPending}
								onClick={() => offer.mutate()}
							>
								{offer.isPending
									? "Sending…"
									: chosen
										? `Offer to ${chosen.name}`
										: "Send offer"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			}
		>
			{options.length === 0 && candidates.isSuccess && (
				<p className="text-muted-foreground text-sm">
					Invite someone to the organization first; only a member can receive
					it.
				</p>
			)}
		</SettingsSection>
	);
}
