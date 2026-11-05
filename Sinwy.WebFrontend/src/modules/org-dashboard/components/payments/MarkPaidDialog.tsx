import type { PaymentDto } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	invalidatePayments,
	markPaymentPaid,
} from "#/modules/org-dashboard/lib/payment-queries";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/shared/components/ui/alert-dialog";
import { toast } from "#/shared/components/ui/toast";
import { formatMinorUnits } from "#/shared/lib/money";

export function MarkPaidDialog({
	organizationId,
	payment,
	onClose,
}: {
	organizationId: string;
	payment: PaymentDto;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const amount = formatMinorUnits(payment.amountMinor, payment.currency);

	const markPaid = useMutation({
		mutationFn: async () =>
			unwrap(await markPaymentPaid(organizationId, payment.id)),
		onSuccess: () =>
			toast.add({ type: "success", title: "Marked as paid", timeout: 4_000 }),
		onError: (error) => {
			if (error.message)
				toast.add({ type: "error", title: error.message, timeout: 6_000 });
		},
		onSettled: () => {
			onClose();
			return invalidatePayments(queryClient, organizationId);
		},
	});

	return (
		<AlertDialog
			open
			onOpenChange={(open) => !open && !markPaid.isPending && onClose()}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Mark {amount} as paid?</AlertDialogTitle>
					<AlertDialogDescription>
						{payment.customerName} · {payment.serviceName}. Do this once you've
						taken the payment at your business. It can't be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={markPaid.isPending}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={markPaid.isPending}
						onClick={() => markPaid.mutate()}
					>
						{markPaid.isPending ? "Saving…" : "Mark as paid"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
