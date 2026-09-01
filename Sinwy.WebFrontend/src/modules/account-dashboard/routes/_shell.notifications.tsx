import { createFileRoute } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/account/_shell/notifications")({
	staticData: { crumb: "Notifications" },
	component: NotificationsPage,
});

function NotificationsPage() {
	return (
		<>
			<PageHeader
				title="Notifications"
				description="Updates about your bookings and organizations."
			/>
			<EmptyState
				icon={<BellIcon />}
				title="You're all caught up"
				description="Notifications will show up here when there's something new."
			/>
		</>
	);
}
