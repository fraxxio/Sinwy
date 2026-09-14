import { createFileRoute } from "@tanstack/react-router";
import { CreditCardIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell/payments")({
	beforeLoad: requirePermission("payments:read"),
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
