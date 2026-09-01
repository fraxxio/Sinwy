import { createFileRoute } from "@tanstack/react-router";
import { CreditCardIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/account/_shell/payments")({
	staticData: { crumb: "Payments" },
	component: PaymentsPage,
});

function PaymentsPage() {
	return (
		<>
			<PageHeader
				title="Payments"
				description="What you've paid for bookings and services."
			/>
			<EmptyState
				icon={<CreditCardIcon />}
				title="No payments yet"
				description="Your payment history will show up here after your first booking."
			/>
		</>
	);
}
