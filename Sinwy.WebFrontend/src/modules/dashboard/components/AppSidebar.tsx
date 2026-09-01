import { linkOptions } from "@tanstack/react-router";
import { GalleryVerticalEndIcon, LayoutDashboardIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { TeamSwitcher } from "#/modules/dashboard/components/TeamSwitcher";
import { NavUser } from "#/shared/components/shell/NavUser";
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
	organizationName,
	organizationSlug,
	...props
}: ComponentProps<typeof Sidebar> & {
	organizationName: string;
	organizationSlug: string;
}) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<TeamSwitcher
					teams={[
						{
							name: organizationName,
							logo: <GalleryVerticalEndIcon />,
							plan: "Organization",
						},
					]}
				/>
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
