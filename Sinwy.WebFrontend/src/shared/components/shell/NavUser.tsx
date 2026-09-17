import { Link } from "@tanstack/react-router";
import {
	BadgeCheckIcon,
	BellIcon,
	ChevronsUpDownIcon,
	LogOutIcon,
	MoonIcon,
	SunIcon,
} from "lucide-react";
import { displayName, initials } from "#/shared/components/shell/display-name";
import { useTheme } from "#/shared/components/ThemeToggle";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "#/shared/components/ui/avatar";
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
import { authClient } from "#/shared/lib/auth/auth-client";
import { useSignOut } from "#/shared/lib/auth/sign-out";

export function NavUser() {
	const { isMobile } = useSidebar();
	const { data: session } = authClient.useSession();
	const signOut = useSignOut();
	const { theme, toggleTheme } = useTheme();

	const name = displayName(session?.user);
	const email = session?.user.email ?? "";
	const avatar = session?.user.image ?? undefined;

	const identity = (
		<>
			<Avatar>
				<AvatarImage src={avatar} alt={name} />
				<AvatarFallback>{initials(name)}</AvatarFallback>
			</Avatar>
			<div className="grid flex-1 text-left text-sm leading-tight">
				<span className="truncate font-medium">{name}</span>
				<span className="truncate text-xs">{email}</span>
			</div>
		</>
	);

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
						}
					>
						{identity}
						<ChevronsUpDownIcon className="ml-auto size-4" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-fit"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="p-0 font-normal">
								<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
									{identity}
								</div>
							</DropdownMenuLabel>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem render={<Link to="/account/settings" />}>
								<BadgeCheckIcon />
								Account settings
							</DropdownMenuItem>
							<DropdownMenuItem render={<Link to="/account/notifications" />}>
								<BellIcon />
								Notifications
							</DropdownMenuItem>
							<DropdownMenuItem closeOnClick={false} onClick={toggleTheme}>
								{theme === "dark" ? <SunIcon /> : <MoonIcon />}
								Toggle theme
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={signOut}>
							<LogOutIcon />
							Log out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
