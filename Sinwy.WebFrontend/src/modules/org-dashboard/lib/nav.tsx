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
		},
		{
			title: "Services",
			icon: <WrenchIcon />,
			link: linkOptions({ to: "/$organizationSlug/services", params }),
		},
		{
			title: "Customers",
			icon: <UsersIcon />,
			link: linkOptions({ to: "/$organizationSlug/customers", params }),
		},
		{
			title: "Pages",
			icon: <FileTextIcon />,
			link: linkOptions({ to: "/$organizationSlug/pages", params }),
		},
		{
			title: "Payments",
			icon: <CreditCardIcon />,
			link: linkOptions({ to: "/$organizationSlug/payments", params }),
		},
		{
			title: "Analytics",
			icon: <ChartNoAxesColumnIcon />,
			link: linkOptions({ to: "/$organizationSlug/analytics", params }),
		},
		{
			title: "Team",
			icon: <UsersRoundIcon />,
			link: linkOptions({ to: "/$organizationSlug/team", params }),
		},
		{
			title: "Settings",
			icon: <Settings2Icon />,
			items: [
				{
					title: "General",
					link: linkOptions({ to: "/$organizationSlug/settings", params }),
				},
				{
					title: "Billing",
					link: linkOptions({
						to: "/$organizationSlug/settings/billing",
						params,
					}),
				},
			],
		},
	];
};
