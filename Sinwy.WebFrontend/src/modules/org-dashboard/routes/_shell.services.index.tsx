import { createFileRoute } from "@tanstack/react-router";
import { WrenchIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/services/")({
	component: ServicesPage,
});

function ServicesPage() {
	return (
		<>
			<PageHeader
				title="Services"
				description="What your organization offers and what it costs."
			/>
			<EmptyState
				icon={<WrenchIcon />}
				title="No services yet"
				description="Add the services you offer so customers can book them."
			/>
		</>
	);
}
