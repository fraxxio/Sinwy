import { hasPermission } from "@sinwy/shared";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ORG_SECTIONS } from "#/modules/org-dashboard/lib/sections";
import { PageHeader } from "#/shared/components/PageHeader";
import { tabsListVariants } from "#/shared/components/ui/tabs";
import { requirePermission } from "#/shared/lib/auth/protected-route";
import { cn } from "#/shared/lib/utils";

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

const tabClassName =
	"inline-flex h-full items-center justify-center rounded-full border border-transparent px-3 py-1 font-medium text-foreground/60 text-sm whitespace-nowrap transition-all hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[status=active]:bg-background data-[status=active]:text-foreground dark:text-muted-foreground dark:data-[status=active]:border-input dark:data-[status=active]:bg-input/30 dark:data-[status=active]:text-foreground dark:hover:text-foreground";

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
			<nav
				aria-label="Settings sections"
				className={cn(
					tabsListVariants(),
					"mx-3 h-9 max-w-full overflow-x-auto",
				)}
			>
				{tabs.map((tab) => (
					<Link
						key={tab.to}
						to={tab.to}
						params={{ organizationSlug: organization.slug }}
						activeOptions={{ exact: true }}
						className={tabClassName}
					>
						{tab.label}
					</Link>
				))}
			</nav>
			<Outlet />
		</>
	);
}
