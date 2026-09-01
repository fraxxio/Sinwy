import { createFileRoute } from "@tanstack/react-router";
import { CreditCardIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/payments")({
	staticData: { crumb: "Payments" },
	component: PaymentsPage,
});

function PaymentsPage() {
	return (
		<>
			<PageHeader
				title="Payments"
				description="Money coming into your organization."
			/>
			<EmptyState
				icon={<CreditCardIcon />}
				title="No payments yet"
				description="Payments from your customers will show up here as they come in."
			/>
		</>
	);
}
