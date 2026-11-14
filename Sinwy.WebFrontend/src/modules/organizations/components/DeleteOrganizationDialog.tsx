import type { OrganizationDeletionPreviewDto } from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { invalidateSubscription } from "#/modules/account-dashboard/lib/billing-queries";
import { postLoginFlagsKey } from "#/modules/user/lib/usePostLoginFlags";
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
import { FieldError, FieldLabel } from "#/shared/components/ui/field";
import { Input } from "#/shared/components/ui/input";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { api } from "#/shared/lib/api";
import { authClient } from "#/shared/lib/auth/auth-client";
import { authErrorMessage } from "#/shared/lib/auth/auth-error";
import { invalidateOrganizations } from "#/shared/lib/organizations";

type DeletableOrganization = { id: string; name: string; slug: string };

const deletionPreviewQuery = (organizationId: string) => ({
	queryKey: ["organizations", organizationId, "deletion-preview"] as const,
	queryFn: async () => {
		const res = await api<OrganizationDeletionPreviewDto>(
			`/account/organizations/${organizationId}/deletion-preview`,
		);
		if (!res.isSuccess) throw new Error(res.message);
		return res.data;
	},
	staleTime: 0,
});

const bookingsLine = (count: number) =>
	count === 0
		? "It has no upcoming bookings."
		: count === 1
			? "1 upcoming booking will be cancelled, and the customer emailed."
			: `${count} upcoming bookings will be cancelled, and those customers emailed.`;

/** The owner's confirm for deleting an organization in any state; it needs the slug typed. */
export function DeleteOrganizationDialog({
	organization,
	trigger,
	label = "Delete organization",
	onDeleted,
}: {
	organization: DeletableOrganization;
	trigger: ReactElement;
	label?: string;
	/** Runs before the organization lists refetch, e.g. to leave its dashboard. */
	onDeleted?: () => Promise<unknown> | undefined;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const preview = useQuery({
		...deletionPreviewQuery(organization.id),
		enabled: open,
	});

	const remove = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.organization.delete({
				organizationId: organization.id,
			});
			if (error) throw new Error(authErrorMessage(error));
		},
		onSuccess: async () => {
			setOpen(false);
			await onDeleted?.();
			toast.add({
				type: "success",
				title: `${organization.name} was deleted`,
				timeout: 4_000,
			});
			await Promise.all([
				invalidateOrganizations(queryClient),
				invalidateSubscription(queryClient),
				queryClient.invalidateQueries({ queryKey: postLoginFlagsKey }),
			]);
		},
	});

	const onOpenChange = (next: boolean) => {
		if (remove.isPending) return;
		setOpen(next);
		if (next) return;
		setTyped("");
		remove.reset();
	};

	const blocked = preview.data?.transferAwaitingCheckout ?? false;
	const canConfirm =
		preview.isSuccess &&
		!blocked &&
		typed.trim() === organization.slug &&
		!remove.isPending;
	const inputId = `delete-${organization.id}`;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogTrigger render={trigger}>{label}</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {organization.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						The organization is removed for good, with its pages, services,
						bookings and team. This cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>

				{preview.isPending ? (
					<Skeleton className="h-16" />
				) : preview.isError ? (
					<FieldError>
						Couldn't check the organization's bookings. Close and try again.
					</FieldError>
				) : blocked ? (
					<p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
						An ownership transfer is waiting on the recipient's checkout. Cancel
						the transfer before deleting the organization.
					</p>
				) : (
					<div className="grid gap-2 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
						<p>{bookingsLine(preview.data.upcomingBookings)}</p>
						<p>
							Your plan isn't affected
							{preview.data.holdsSlot
								? ", and one organization slot is freed."
								: "."}
						</p>
					</div>
				)}

				<div className="grid gap-2">
					<FieldLabel htmlFor={inputId}>
						Type <span className="font-mono">{organization.slug}</span> to
						confirm
					</FieldLabel>
					<Input
						id={inputId}
						autoComplete="off"
						value={typed}
						disabled={blocked}
						onChange={(e) => setTyped(e.target.value)}
					/>
				</div>

				{remove.isError && <FieldError>{remove.error.message}</FieldError>}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={remove.isPending}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={!canConfirm}
						onClick={() => remove.mutate()}
					>
						{remove.isPending ? "Deleting…" : "Delete organization"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
