import { createFileRoute } from "@tanstack/react-router";
import { CreditCardIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute(
	"/$organizationSlug/_shell/settings/billing",
)({
	beforeLoad: requirePermission("billing:manage"),
	staticData: { crumb: "Billing" },
	component: BillingPage,
});

function BillingPage() {
	return (
		<>
			<PageHeader
				title="Billing"
				description="Your organization's plan, invoices and payment method."
			/>
			<EmptyState
				icon={<CreditCardIcon />}
				title="Nothing here yet"
				description="Plan and invoice management will live here."
			/>
		</>
	);
}
