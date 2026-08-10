import {
	BookOpenIcon,
	CalendarCheckIcon,
	FrameIcon,
	GalleryVerticalEndIcon,
	LayoutDashboardIcon,
	MapIcon,
	PieChartIcon,
	Settings2Icon,
	UsersIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { NavMain } from "#/modules/dashboard/components/NavMain";
import { NavProjects } from "#/modules/dashboard/components/NavProjects";
import { NavUser } from "#/modules/dashboard/components/NavUser";
import { TeamSwitcher } from "#/modules/dashboard/components/TeamSwitcher";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "#/shared/components/ui/sidebar";

const navMain = [
	{
		title: "Overview",
		url: "#",
		icon: <LayoutDashboardIcon />,
		isActive: true,
		items: [
			{ title: "Home", url: "#" },
			{ title: "Activity", url: "#" },
		],
	},
	{
		title: "Bookings",
		url: "#",
		icon: <CalendarCheckIcon />,
		items: [
			{ title: "Calendar", url: "#" },
			{ title: "Requests", url: "#" },
		],
	},
	{
		title: "Customers",
		url: "#",
		icon: <UsersIcon />,
		items: [
			{ title: "All customers", url: "#" },
			{ title: "Segments", url: "#" },
		],
	},
	{
		title: "Documentation",
		url: "#",
		icon: <BookOpenIcon />,
		items: [
			{ title: "Introduction", url: "#" },
			{ title: "Get started", url: "#" },
		],
	},
	{
		title: "Settings",
		url: "#",
		icon: <Settings2Icon />,
		items: [
			{ title: "General", url: "#" },
			{ title: "Team", url: "#" },
			{ title: "Billing", url: "#" },
		],
	},
];

const projects = [
	{ name: "Design Engineering", url: "#", icon: <FrameIcon /> },
	{ name: "Sales & Marketing", url: "#", icon: <PieChartIcon /> },
	{ name: "Travel", url: "#", icon: <MapIcon /> },
];

export function AppSidebar({
	organizationName,
	...props
}: ComponentProps<typeof Sidebar> & { organizationName: string }) {
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
				<NavMain items={navMain} />
				<NavProjects projects={projects} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
