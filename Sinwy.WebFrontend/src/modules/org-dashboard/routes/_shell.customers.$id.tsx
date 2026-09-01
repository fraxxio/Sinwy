import { createFileRoute } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/customers/$id")(
	{
		staticData: { crumb: "Customer" },
		component: CustomerDetailPage,
	},
);

function CustomerDetailPage() {
	const { id } = Route.useParams();

	return (
		<>
			<PageHeader title={`Customer ${id}`} />
			<EmptyState
				icon={<UsersIcon />}
				title="Nothing here yet"
				description="Customer details will live here once customers exist."
			/>
		</>
	);
}
