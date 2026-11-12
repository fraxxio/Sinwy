import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PrinterIcon, ReceiptIcon } from "lucide-react";
import { Receipt } from "#/modules/account-dashboard/components/payments/Receipt";
import { accountPaymentQuery } from "#/modules/account-dashboard/lib/payment-queries";
import { receiptHeadingOf } from "#/modules/account-dashboard/lib/receipt";
import { ContentBox } from "#/shared/components/ContentBox";
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
				<ContentBox>
					<FieldError>{payment.error.message}</FieldError>
				</ContentBox>
			</>
		);
	if (payment.isPending)
		return (
			<>
				<PageHeader title="Payment" action={<PrintButton disabled />} />
				<ContentBox>
					<Skeleton className="h-72 rounded-md" />
				</ContentBox>
			</>
		);
	if (payment.data === null)
		return (
			<>
				<PageHeader title="Payment" />
				<ContentBox>
					<EmptyState
						icon={<ReceiptIcon />}
						title="Payment not found"
						description="It may belong to another account."
						className="border-none"
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
				</ContentBox>
			</>
		);

	return (
		<>
			<PageHeader
				title={receiptHeadingOf(payment.data.status)}
				action={<PrintButton />}
			/>
			<ContentBox className="gap-4 print:border-0 print:bg-transparent print:p-0">
				<PaymentsNotice audience="customer" />
				<Receipt payment={payment.data} />
			</ContentBox>
		</>
	);
}

function PrintButton({ disabled = false }: { disabled?: boolean }) {
	return (
		<Button
			variant="outline"
			className="print:hidden"
			disabled={disabled}
			onClick={() => window.print()}
		>
			<PrinterIcon />
			Print
		</Button>
	);
}
