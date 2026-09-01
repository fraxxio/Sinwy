import { createFileRoute } from "@tanstack/react-router";
import { WrenchIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/services/$id")({
	staticData: { crumb: "Service" },
	component: ServiceDetailPage,
});

function ServiceDetailPage() {
	const { id } = Route.useParams();

	return (
		<>
			<PageHeader title={`Service ${id}`} />
			<EmptyState
				icon={<WrenchIcon />}
				title="Nothing here yet"
				description="Service details will live here once services exist."
			/>
		</>
	);
}
