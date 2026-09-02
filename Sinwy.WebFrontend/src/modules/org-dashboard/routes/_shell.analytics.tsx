import { createFileRoute } from "@tanstack/react-router";
import { ChartNoAxesColumnIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/analytics")({
	staticData: { crumb: "Analytics" },
	component: AnalyticsPage,
});

function AnalyticsPage() {
	return (
		<>
			<PageHeader
				title="Analytics"
				description="How your pages, bookings and revenue are trending."
			/>
			<EmptyState
				icon={<ChartNoAxesColumnIcon />}
				title="No data yet"
				description="Analytics need activity first — they fill in as customers visit and book."
			/>
		</>
	);
}
