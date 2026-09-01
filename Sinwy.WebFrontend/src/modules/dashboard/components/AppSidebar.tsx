import { linkOptions } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { NavUser } from "#/shared/components/shell/NavUser";
import { OrganizationSwitcher } from "#/shared/components/shell/OrganizationSwitcher";
import {
	SidebarNav,
	type SidebarNavItem,
} from "#/shared/components/shell/SidebarNav";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "#/shared/components/ui/sidebar";

const navItems = (organizationSlug: string): SidebarNavItem[] => [
	{
		title: "Home",
		icon: <LayoutDashboardIcon />,
		link: linkOptions({
			to: "/$organizationSlug/home",
			params: { organizationSlug },
		}),
	},
];

export function AppSidebar({
	organizationSlug,
	...props
}: ComponentProps<typeof Sidebar> & {
	organizationSlug: string;
}) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<OrganizationSwitcher activeOrganizationSlug={organizationSlug} />
			</SidebarHeader>
			<SidebarContent>
				<SidebarNav label="Manage" items={navItems(organizationSlug)} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
