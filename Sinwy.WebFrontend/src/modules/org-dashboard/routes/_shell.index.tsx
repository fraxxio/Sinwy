import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/")({
	component: OverviewPage,
});

function OverviewPage() {
	return (
		<>
			<PageHeader
				title="Overview"
				description="What's happening across your organization at a glance."
			/>
			<EmptyState
				icon={<LayoutDashboardIcon />}
				title="Nothing to show yet"
				description="Once bookings and payments start coming in, your organization's activity will show up here."
			/>
		</>
	);
}
