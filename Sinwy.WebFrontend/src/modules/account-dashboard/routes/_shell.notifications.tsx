import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PageHeader } from "#/shared/components/PageHeader";
import { RouteTabs, routeTabClassName } from "#/shared/components/RouteTabs";

export const Route = createFileRoute("/account/_shell/notifications")({
	staticData: { crumb: "Notifications" },
	component: NotificationsLayout,
});

const NOTIFICATION_TABS = [
	{ label: "Inbox", to: "/account/notifications" },
	{ label: "Preferences", to: "/account/notifications/preferences" },
] as const;

function NotificationsLayout() {
	return (
		<>
			<PageHeader
				title="Notifications"
				description="Updates about your bookings and organizations."
			/>
			<RouteTabs label="Notification sections">
				{NOTIFICATION_TABS.map((tab) => (
					<Link
						key={tab.to}
						to={tab.to}
						activeOptions={{ exact: true }}
						className={routeTabClassName}
					>
						{tab.label}
					</Link>
				))}
			</RouteTabs>
			<Outlet />
		</>
	);
}
