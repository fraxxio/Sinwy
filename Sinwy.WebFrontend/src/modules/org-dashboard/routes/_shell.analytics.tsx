import { createFileRoute } from "@tanstack/react-router";
import { ChartNoAxesColumnIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell/analytics")({
	beforeLoad: requirePermission("analytics:read"),
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
