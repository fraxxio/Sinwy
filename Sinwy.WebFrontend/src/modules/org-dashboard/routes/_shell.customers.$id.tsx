import { createFileRoute } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/customers/$id",
)({
	staticData: { crumb: "Customer" },
	component: CustomerDetailPage,
});

function CustomerDetailPage() {
	const { id } = Route.useParams();

	return (
		<>
			<PageHeader title={`Customer ${id}`} />
			<ContentBox>
				<EmptyState
					icon={<UsersIcon />}
					title="Nothing here yet"
					description="Customer details will live here once customers exist."
					className="border-none"
				/>
			</ContentBox>
		</>
	);
}
