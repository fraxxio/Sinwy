import type { ComponentProps } from "react";
import { accountNav } from "#/modules/account-dashboard/lib/nav";
import { NavUser } from "#/shared/components/shell/NavUser";
import { OrganizationSwitcher } from "#/shared/components/shell/OrganizationSwitcher";
import { SidebarNav } from "#/shared/components/shell/SidebarNav";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "#/shared/components/ui/sidebar";

export function AccountSidebar(props: ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<OrganizationSwitcher activeOrganizationSlug={null} />
			</SidebarHeader>
			<SidebarContent>
				<SidebarNav label="Your account" items={accountNav} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
