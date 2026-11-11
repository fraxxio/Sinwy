import { createFileRoute } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/customers/",
)({
	component: CustomersPage,
});

function CustomersPage() {
	return (
		<>
			<PageHeader
				title="Customers"
				description="Everyone who has booked or paid your organization."
			/>
			<ContentBox>
				<EmptyState
					icon={<UsersIcon />}
					title="No customers yet"
					description="Customers appear here after their first booking or payment."
					className="border-none"
				/>
			</ContentBox>
		</>
	);
}
