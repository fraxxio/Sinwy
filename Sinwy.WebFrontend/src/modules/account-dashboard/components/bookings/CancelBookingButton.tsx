import type { CustomerBookingDto } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	cancelAccountBooking,
	invalidateAccountBookings,
} from "#/modules/account-dashboard/lib/booking-queries";
import {
	AlertDialog,
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

export function CancelBookingButton({
	booking,
}: {
	booking: CustomerBookingDto;
}) {
	const [open, setOpen] = useState(false);
	const queryClient = useQueryClient();
	const request = booking.status === "pending";

	const cancel = useMutation({
		mutationFn: async () => {
			const res = await cancelAccountBooking(booking.id);
			if (!res.isSuccess) throw new Error(res.message);
			return res.data;
		},
		onSuccess: () => {
			setOpen(false);
			toast.add({
				type: "success",
				title: request ? "Request withdrawn" : "Booking cancelled",
				timeout: 4_000,
			});
		},
		onSettled: () => invalidateAccountBookings(queryClient),
	});

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (cancel.isPending) return;
				if (next) cancel.reset();
				setOpen(next);
			}}
		>
			<AlertDialogTrigger render={<Button variant="outline" />}>
				{request ? "Withdraw request" : "Cancel booking"}
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{request ? "Withdraw this request?" : "Cancel this booking?"}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{booking.organization.name} gets an email that you cancelled. To
						come back, book again.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{cancel.error && <FieldError>{cancel.error.message}</FieldError>}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={cancel.isPending}>
						Keep it
					</AlertDialogCancel>
					<Button
						variant="destructive"
						disabled={cancel.isPending}
						onClick={() => cancel.mutate()}
					>
						{cancel.isPending
							? "Cancelling…"
							: request
								? "Withdraw request"
								: "Cancel booking"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
