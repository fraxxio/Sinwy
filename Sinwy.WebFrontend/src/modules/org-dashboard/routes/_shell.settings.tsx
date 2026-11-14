import { hasPermission } from "@sinwy/shared";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ORG_SECTIONS } from "#/modules/org-dashboard/lib/sections";
import { PageHeader } from "#/shared/components/PageHeader";
import { RouteTabs, routeTabClassName } from "#/shared/components/RouteTabs";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/settings",
)({
	beforeLoad: requirePermission(ORG_SECTIONS.settings.permission),
	staticData: { crumb: "Settings" },
	component: SettingsLayout,
});

const SETTINGS_TABS = [
	{ label: "General", to: "/dashboard/$organizationSlug/settings" },
	{ label: "Branding", to: "/dashboard/$organizationSlug/settings/branding" },
	{ label: "Activity", to: "/dashboard/$organizationSlug/settings/activity" },
	{
		label: "Ownership & danger zone",
		to: "/dashboard/$organizationSlug/settings/ownership",
		ownerOnly: true,
	},
] as const;

function SettingsLayout() {
	const { organization, member } = Route.useRouteContext();
	// billing:manage is the owner's alone
	const isOwner = hasPermission(member.roles, "billing:manage");
	const tabs = SETTINGS_TABS.filter(
		(tab) => isOwner || !("ownerOnly" in tab && tab.ownerOnly),
	);

	return (
		<>
			<PageHeader
				title="Settings"
				description="Your organization's profile and general configuration."
			/>
			<RouteTabs label="Settings sections">
				{tabs.map((tab) => (
					<Link
						key={tab.to}
						to={tab.to}
						params={{ organizationSlug: organization.slug }}
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
