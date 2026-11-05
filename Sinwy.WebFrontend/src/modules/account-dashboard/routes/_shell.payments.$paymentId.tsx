import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PrinterIcon, ReceiptIcon } from "lucide-react";
import { Receipt } from "#/modules/account-dashboard/components/payments/Receipt";
import { accountPaymentQuery } from "#/modules/account-dashboard/lib/payment-queries";
import { receiptHeadingOf } from "#/modules/account-dashboard/lib/receipt";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { PaymentsNotice } from "#/shared/components/payment/PaymentsNotice";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

export const Route = createFileRoute("/account/_shell/payments/$paymentId")({
	staticData: { crumb: "Payment" },
	component: PaymentDetailPage,
});

function PaymentDetailPage() {
	const { paymentId } = Route.useParams();
	const payment = useQuery(accountPaymentQuery(paymentId));

	if (payment.isError)
		return (
			<>
				<PageHeader title="Payment" />
				<FieldError>{payment.error.message}</FieldError>
			</>
		);
	if (payment.isPending) return <Skeleton className="h-96 rounded-xl" />;
	if (payment.data === null)
		return (
			<>
				<PageHeader title="Payment" />
				<EmptyState
					icon={<ReceiptIcon />}
					title="Payment not found"
					description="It may belong to another account."
					action={
						<Button
							variant="outline"
							nativeButton={false}
							render={<Link to="/account/payments" />}
						>
							Back to payments
						</Button>
					}
				/>
			</>
		);

	return (
		<>
			<PageHeader
				title={receiptHeadingOf(payment.data.status)}
				action={
					<Button
						variant="outline"
						className="print:hidden"
						onClick={() => window.print()}
					>
						<PrinterIcon />
						Print
					</Button>
				}
			/>
			<PaymentsNotice audience="customer" />
			<Receipt payment={payment.data} />
		</>
	);
}
