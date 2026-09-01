import { createFileRoute } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/pages/")({
	component: PagesPage,
});

function PagesPage() {
	return (
		<>
			<PageHeader
				title="Pages"
				description="The public pages your customers see."
			/>
			<EmptyState
				icon={<FileTextIcon />}
				title="No pages yet"
				description="Build a page from a template to give your organization a public presence."
			/>
		</>
	);
}
