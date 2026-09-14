import type { Permission } from "@sinwy/shared";
import { Link, type LinkOptions } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { filterNav } from "#/shared/components/shell/nav-filter";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/shared/components/ui/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "#/shared/components/ui/sidebar";
import { usePermissions } from "#/shared/lib/auth/permissions";

/** Items with a permission are hidden from members who lack it. */
type SidebarNavLink = {
	title: string;
	icon: ReactNode;
	link: LinkOptions;
	activeOptions?: { exact: boolean };
	permission?: Permission;
	items?: never;
};

type SidebarNavSubItem = {
	title: string;
	link: LinkOptions;
	permission?: Permission;
};

/** Collapsible group: the parent only toggles, so it carries no link or permission. */
type SidebarNavGroup = {
	title: string;
	icon: ReactNode;
	items: SidebarNavSubItem[];
	link?: never;
	activeOptions?: never;
	permission?: never;
};

export type SidebarNavItem = SidebarNavLink | SidebarNavGroup;

export function SidebarNav({
	label,
	items,
}: {
	label: string;
	items: SidebarNavItem[];
}) {
	const { can } = usePermissions();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>{label}</SidebarGroupLabel>
			<SidebarMenu>
				{filterNav(items, can).map((item) =>
					item.items ? (
						<Collapsible
							key={item.title}
							defaultOpen
							className="group/collapsible"
							render={<SidebarMenuItem />}
						>
							<CollapsibleTrigger
								render={<SidebarMenuButton tooltip={item.title} />}
							>
								{item.icon}
								<span>{item.title}</span>
								<ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
							</CollapsibleTrigger>
							<CollapsibleContent>
								<SidebarMenuSub>
									{item.items.map((subItem) => (
										<SidebarMenuSubItem key={subItem.title}>
											<SidebarMenuSubButton
												render={
													<Link
														{...subItem.link}
														activeOptions={{ exact: true }}
														activeProps={{ "data-active": "" }}
													/>
												}
											>
												<span>{subItem.title}</span>
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
									))}
								</SidebarMenuSub>
							</CollapsibleContent>
						</Collapsible>
					) : (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								tooltip={item.title}
								render={
									<Link
										{...item.link}
										activeOptions={item.activeOptions ?? { exact: false }}
										activeProps={{ "data-active": "" }}
									/>
								}
							>
								{item.icon}
								<span>{item.title}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					),
				)}
			</SidebarMenu>
		</SidebarGroup>
	);
}
