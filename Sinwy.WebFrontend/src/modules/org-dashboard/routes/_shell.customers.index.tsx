import { createFileRoute } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/customers/")({
	staticData: { crumb: "Customers" },
	component: CustomersPage,
});

function CustomersPage() {
	return (
		<>
			<PageHeader
				title="Customers"
				description="Everyone who has booked or paid your organization."
			/>
			<EmptyState
				icon={<UsersIcon />}
				title="No customers yet"
				description="Customers appear here after their first booking or payment."
			/>
		</>
	);
}
