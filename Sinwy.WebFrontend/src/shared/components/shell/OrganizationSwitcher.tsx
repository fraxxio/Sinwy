import type { OrganizationStatus, OrganizationSummary } from "@sinwy/shared";
import { Link, linkOptions } from "@tanstack/react-router";
import {
	Building2Icon,
	ChevronsUpDownIcon,
	PlusIcon,
	UserIcon,
} from "lucide-react";
import { authClient } from "#/modules/auth/lib/auth-client";
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

const personalAccountLink = linkOptions({ to: "/account" });

export function OrganizationSwitcher({
	activeOrganizationSlug,
}: {
	activeOrganizationSlug: string | null;
}) {
	const { isMobile } = useSidebar();
	const { data: session } = authClient.useSession();
	const { data, isPending } = authClient.useListOrganizations();

	const organizations: OrganizationSummary[] = (data ?? []).map((org) => ({
		id: org.id,
		name: org.name,
		slug: org.slug,
		status: org.status as OrganizationStatus,
	}));
	const activeOrganization = organizations.find(
		(org) => org.slug === activeOrganizationSlug,
	);

	// While the list loads, trust the shell-supplied slug so the trigger does
	// not flash "Personal account" inside an organization.
	const inOrganization =
		activeOrganizationSlug !== null && (isPending || !!activeOrganization);
	const label = inOrganization
		? (activeOrganization?.name ?? activeOrganizationSlug)
		: session?.user.name || session?.user.email || "";
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
										<DropdownMenuItem
											key={org.id}
											className="gap-2 p-2"
											render={
												<Link
													to="/$organizationSlug"
													params={{ organizationSlug: org.slug }}
												/>
											}
										>
											<div className="flex size-6 items-center justify-center rounded-md border">
												<Building2Icon className="size-4" />
											</div>
											{org.name}
										</DropdownMenuItem>
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
