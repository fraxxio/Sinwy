import type { ComponentProps } from "react";
import { organizationNav } from "#/modules/org-dashboard/lib/nav";
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

export function OrganizationSidebar({
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
				<SidebarNav label="Manage" items={organizationNav(organizationSlug)} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
