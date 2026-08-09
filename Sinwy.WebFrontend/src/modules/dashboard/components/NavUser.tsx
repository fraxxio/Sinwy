import { useNavigate } from "@tanstack/react-router";
import {
	BadgeCheckIcon,
	BellIcon,
	ChevronsUpDownIcon,
	CreditCardIcon,
	LogOutIcon,
	SparklesIcon,
} from "lucide-react";
import { authClient } from "#/modules/auth/lib/auth-client";
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

const initials = (name: string) =>
	name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("") || "?";

export function NavUser() {
	const { isMobile } = useSidebar();
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();

	const name = session?.user.name || session?.user.email || "";
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
							<DropdownMenuItem>
								<SparklesIcon />
								Upgrade to Pro
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem>
								<BadgeCheckIcon />
								Account
							</DropdownMenuItem>
							<DropdownMenuItem>
								<CreditCardIcon />
								Billing
							</DropdownMenuItem>
							<DropdownMenuItem>
								<BellIcon />
								Notifications
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={async () => {
								await authClient.signOut();
								await navigate({ to: "/" });
							}}
						>
							<LogOutIcon />
							Log out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
