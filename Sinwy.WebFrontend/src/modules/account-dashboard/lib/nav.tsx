import { linkOptions } from "@tanstack/react-router";
import {
	BellIcon,
	Building2Icon,
	CalendarCheckIcon,
	CreditCardIcon,
	LayoutDashboardIcon,
	Settings2Icon,
} from "lucide-react";
import type { SidebarNavItem } from "#/shared/components/shell/SidebarNav";

export const accountNav: SidebarNavItem[] = [
	{
		title: "Overview",
		icon: <LayoutDashboardIcon />,
		link: linkOptions({ to: "/account" }),
		activeOptions: { exact: true },
	},
	{
		title: "Bookings",
		icon: <CalendarCheckIcon />,
		link: linkOptions({ to: "/account/bookings" }),
	},
	{
		title: "Payments",
		icon: <CreditCardIcon />,
		link: linkOptions({ to: "/account/payments" }),
	},
	{
		title: "Organizations",
		icon: <Building2Icon />,
		link: linkOptions({ to: "/account/organizations" }),
	},
	{
		title: "Notifications",
		icon: <BellIcon />,
		link: linkOptions({ to: "/account/notifications" }),
	},
	{
		title: "Settings",
		icon: <Settings2Icon />,
		link: linkOptions({ to: "/account/settings" }),
	},
];
