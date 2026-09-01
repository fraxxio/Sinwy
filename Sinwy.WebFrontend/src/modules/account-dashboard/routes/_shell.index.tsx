import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/account/_shell/")({
	component: AccountOverviewPage,
});

function AccountOverviewPage() {
	return (
		<>
			<PageHeader
				title="Overview"
				description="Your bookings, payments and organizations at a glance."
			/>
			<EmptyState
				icon={<LayoutDashboardIcon />}
				title="Nothing to show yet"
				description="Once you book a service or join an organization, your activity will show up here."
			/>
		</>
	);
}
