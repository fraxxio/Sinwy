import type { OrganizationSummary } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, linkOptions } from "@tanstack/react-router";
import {
	Building2Icon,
	ChevronsUpDownIcon,
	PlusIcon,
	UserIcon,
} from "lucide-react";
import { displayName } from "#/shared/components/shell/display-name";
import { Badge } from "#/shared/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/shared/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "#/shared/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/shared/components/ui/tooltip";
import { authClient } from "#/shared/lib/auth/auth-client";
import {
	closedOrganizationReason,
	isOrganizationOpen,
	organizationsQuery,
	reactivationLink,
} from "#/shared/lib/organizations";

const personalAccountLink = linkOptions({ to: "/account" });

export function OrganizationSwitcher({
	activeOrganizationSlug,
}: {
	activeOrganizationSlug: string | null;
}) {
	const { isMobile } = useSidebar();
	const { data: session } = authClient.useSession();
	const { data: organizations = [], isPending } = useQuery(organizationsQuery);
	const activeOrganization = organizations.find(
		(org) => org.slug === activeOrganizationSlug,
	);

	// While the list loads, trust the shell-supplied slug so the trigger does
	// not flash "Personal account" inside an organization.
	const inOrganization =
		activeOrganizationSlug !== null && (isPending || !!activeOrganization);
	const label = inOrganization
		? (activeOrganization?.name ?? activeOrganizationSlug)
		: displayName(session?.user);
	const caption = inOrganization ? "Organization" : "Personal account";

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
							/>
						}
					>
						<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
							{inOrganization ? <Building2Icon /> : <UserIcon />}
						</div>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">{label}</span>
							<span className="truncate text-xs">{caption}</span>
						</div>
						<ChevronsUpDownIcon className="ml-auto" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-fit"
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						{organizations.length > 0 && (
							<>
								<DropdownMenuGroup>
									<DropdownMenuLabel className="text-xs text-muted-foreground">
										Organizations
									</DropdownMenuLabel>
									{organizations.map((org) => (
										<OrganizationItem key={org.id} organization={org} />
									))}
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
							</>
						)}
						<DropdownMenuGroup>
							<DropdownMenuItem
								className="gap-2 p-2"
								render={<Link {...personalAccountLink} />}
							>
								<div className="flex size-6 items-center justify-center rounded-md border">
									<UserIcon className="size-4" />
								</div>
								Personal account
							</DropdownMenuItem>
							<DropdownMenuItem
								className="gap-2 p-2"
								render={<Link to="/organizations/new" />}
							>
								<div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
									<PlusIcon className="size-4" />
								</div>
								<div className="font-medium text-muted-foreground">
									Create organization
								</div>
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

/**
 * An organization that can't be opened leads its owner to the plan page and
 * is disabled for everyone else, with the reason on hover.
 */
function OrganizationItem({
	organization,
}: {
	organization: OrganizationSummary;
}) {
	const open = isOrganizationOpen(organization);
	const content = (
		<>
			<div className="flex size-6 items-center justify-center rounded-md border">
				<Building2Icon className="size-4" />
			</div>
			{organization.name}
			{!open && (
				<Badge variant="outline" className="ml-auto">
					Inactive
				</Badge>
			)}
		</>
	);

	if (open)
		return (
			<DropdownMenuItem
				className="gap-2 p-2"
				render={
					<Link
						to="/$organizationSlug"
						params={{ organizationSlug: organization.slug }}
					/>
				}
			>
				{content}
			</DropdownMenuItem>
		);

	const link = reactivationLink(organization);
	if (link)
		return (
			<DropdownMenuItem className="gap-2 p-2" render={<Link {...link} />}>
				{content}
			</DropdownMenuItem>
		);

	// a disabled item takes no pointer events, so the wrapper carries the hover
	return (
		<Tooltip>
			<TooltipTrigger render={<div />}>
				<DropdownMenuItem disabled className="gap-2 p-2">
					{content}
				</DropdownMenuItem>
			</TooltipTrigger>
			<TooltipContent side="right">
				{closedOrganizationReason(organization)}
			</TooltipContent>
		</Tooltip>
	);
}
