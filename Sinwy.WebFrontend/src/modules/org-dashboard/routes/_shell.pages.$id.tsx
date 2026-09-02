import { createFileRoute } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/pages/$id")({
	staticData: { crumb: "Page" },
	component: PageDetailPage,
});

function PageDetailPage() {
	const { id } = Route.useParams();

	return (
		<>
			<PageHeader title={`Page ${id}`} />
			<EmptyState
				icon={<FileTextIcon />}
				title="Nothing here yet"
				description="Page details will live here once pages exist."
			/>
		</>
	);
}
