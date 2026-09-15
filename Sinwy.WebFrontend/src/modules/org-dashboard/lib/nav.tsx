import { linkOptions } from "@tanstack/react-router";
import {
	CalendarCheckIcon,
	ChartNoAxesColumnIcon,
	CreditCardIcon,
	FileTextIcon,
	LayoutDashboardIcon,
	Settings2Icon,
	UsersIcon,
	UsersRoundIcon,
	WrenchIcon,
} from "lucide-react";
import type { SidebarNavItem } from "#/shared/components/shell/SidebarNav";

export const organizationNav = (organizationSlug: string): SidebarNavItem[] => {
	const params = { organizationSlug };

	return [
		{
			title: "Overview",
			icon: <LayoutDashboardIcon />,
			link: linkOptions({ to: "/$organizationSlug", params }),
			activeOptions: { exact: true },
		},
		{
			title: "Bookings",
			icon: <CalendarCheckIcon />,
			link: linkOptions({ to: "/$organizationSlug/bookings", params }),
			permission: "bookings:read",
		},
		{
			title: "Services",
			icon: <WrenchIcon />,
			link: linkOptions({ to: "/$organizationSlug/services", params }),
			permission: "services:read",
		},
		{
			title: "Customers",
			icon: <UsersIcon />,
			link: linkOptions({ to: "/$organizationSlug/customers", params }),
			permission: "customers:read",
		},
		{
			title: "Pages",
			icon: <FileTextIcon />,
			link: linkOptions({ to: "/$organizationSlug/pages", params }),
			permission: "pages:read",
		},
		{
			title: "Payments",
			icon: <CreditCardIcon />,
			link: linkOptions({ to: "/$organizationSlug/payments", params }),
			permission: "payments:read",
		},
		{
			title: "Analytics",
			icon: <ChartNoAxesColumnIcon />,
			link: linkOptions({ to: "/$organizationSlug/analytics", params }),
			permission: "analytics:read",
		},
		{
			title: "Team",
			icon: <UsersRoundIcon />,
			link: linkOptions({ to: "/$organizationSlug/team", params }),
			permission: "people:manage",
		},
		{
			title: "Settings",
			icon: <Settings2Icon />,
			items: [
				{
					title: "General",
					link: linkOptions({ to: "/$organizationSlug/settings", params }),
					permission: "settings:manage",
				},
				{
					title: "Billing",
					link: linkOptions({
						to: "/$organizationSlug/settings/billing",
						params,
					}),
					permission: "billing:manage",
				},
			],
		},
	];
};
