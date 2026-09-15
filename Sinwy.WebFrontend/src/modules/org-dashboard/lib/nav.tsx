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
import { ORG_SECTIONS } from "#/modules/org-dashboard/lib/sections";
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
			link: linkOptions({ to: ORG_SECTIONS.bookings.to, params }),
			permission: ORG_SECTIONS.bookings.permission,
		},
		{
			title: "Services",
			icon: <WrenchIcon />,
			link: linkOptions({ to: ORG_SECTIONS.services.to, params }),
			permission: ORG_SECTIONS.services.permission,
		},
		{
			title: "Customers",
			icon: <UsersIcon />,
			link: linkOptions({ to: ORG_SECTIONS.customers.to, params }),
			permission: ORG_SECTIONS.customers.permission,
		},
		{
			title: "Pages",
			icon: <FileTextIcon />,
			link: linkOptions({ to: ORG_SECTIONS.pages.to, params }),
			permission: ORG_SECTIONS.pages.permission,
		},
		{
			title: "Payments",
			icon: <CreditCardIcon />,
			link: linkOptions({ to: ORG_SECTIONS.payments.to, params }),
			permission: ORG_SECTIONS.payments.permission,
		},
		{
			title: "Analytics",
			icon: <ChartNoAxesColumnIcon />,
			link: linkOptions({ to: ORG_SECTIONS.analytics.to, params }),
			permission: ORG_SECTIONS.analytics.permission,
		},
		{
			title: "Team",
			icon: <UsersRoundIcon />,
			link: linkOptions({ to: ORG_SECTIONS.team.to, params }),
			permission: ORG_SECTIONS.team.permission,
		},
		{
			title: "Settings",
			icon: <Settings2Icon />,
			items: [
				{
					title: "General",
					link: linkOptions({ to: ORG_SECTIONS.settings.to, params }),
					permission: ORG_SECTIONS.settings.permission,
				},
				{
					title: "Billing",
					link: linkOptions({ to: ORG_SECTIONS.billing.to, params }),
					permission: ORG_SECTIONS.billing.permission,
				},
			],
		},
	];
};
