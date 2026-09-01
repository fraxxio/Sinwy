import { Link, useNavigate } from "@tanstack/react-router";
import {
	CalendarDays,
	CreditCard,
	LayoutDashboard,
	LogOut,
	Menu,
	Settings,
	User,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import NavLinks from "#/shared/components/NavLinks.tsx";
import { Button } from "#/shared/components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/shared/components/ui/dropdown-menu.tsx";
import { Separator } from "#/shared/components/ui/separator.tsx";
import { authClient } from "#/shared/lib/auth/auth-client.ts";
import SinwyLogo from "./SinwyLogo.tsx";
import ThemeToggle from "./ThemeToggle.tsx";

const ACCOUNT_LINKS = [
	{ label: "My bookings", href: "/account/bookings", icon: CalendarDays },
	{ label: "Payments", href: "/account/payments", icon: CreditCard },
	{ label: "Profile settings", href: "/account/settings", icon: Settings },
] as const;

type UserMenuProps = {
	name: string;
	email: string;
	onSignOut: () => void;
	onNavigate: () => void;
};

const UserMenu = ({ name, email, onSignOut, onNavigate }: UserMenuProps) => {
	const { data: organizations } = authClient.useListOrganizations();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="secondary" className="min-w-0" />}
			>
				<User />
				<span className="truncate">{name}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="p-0 font-normal">
						<div className="grid px-3 py-2.5 text-left leading-tight">
							<span className="truncate text-sm font-medium text-foreground">
								{name}
							</span>
							<span className="truncate text-xs">{email}</span>
						</div>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				{organizations?.length ? (
					<>
						<DropdownMenuItem
							render={<Link to="/auth/postlogin" />}
							onClick={onNavigate}
						>
							<LayoutDashboard />
							Organization dashboard
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				) : null}
				<DropdownMenuGroup>
					{ACCOUNT_LINKS.map((item) => (
						<DropdownMenuItem
							key={item.label}
							render={
								<a href={item.href}>
									<item.icon />
									{item.label}
								</a>
							}
							onClick={onNavigate}
						/>
					))}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onSignOut}>
					<LogOut />
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

const MobileUserMenu = ({
	name,
	email,
	onSignOut,
	onNavigate,
}: UserMenuProps) => {
	const { data: organizations } = authClient.useListOrganizations();
	const itemClassName =
		"nav-link flex items-center gap-3 rounded-xl px-4 py-3 text-lg text-foreground";

	return (
		<>
			<Separator className="my-2" />
			<div className="px-4 leading-tight">
				<p className="font-medium">{name}</p>
				<p className="text-sm text-muted-foreground">{email}</p>
			</div>
			{organizations?.length ? (
				<Link
					to="/auth/postlogin"
					className={itemClassName}
					onClick={onNavigate}
				>
					<LayoutDashboard className="size-5" />
					Organization dashboard
				</Link>
			) : null}
			{ACCOUNT_LINKS.map((item) => (
				<a
					key={item.label}
					href={item.href}
					className={itemClassName}
					onClick={onNavigate}
				>
					<item.icon className="size-5" />
					{item.label}
				</a>
			))}
			<button type="button" className={itemClassName} onClick={onSignOut}>
				<LogOut className="size-5" />
				Log out
			</button>
		</>
	);
};

const Header = () => {
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	useEffect(() => {
		if (!isMenuOpen) {
			return;
		}

		const root = document.documentElement;
		const previousOverflow = root.style.overflow;
		root.style.overflow = "hidden";

		const desktop = window.matchMedia("(min-width: 64rem)");
		const close = () => setIsMenuOpen(false);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				close();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		desktop.addEventListener("change", close);

		return () => {
			root.style.overflow = previousOverflow;
			window.removeEventListener("keydown", onKeyDown);
			desktop.removeEventListener("change", close);
		};
	}, [isMenuOpen]);

	async function signOut() {
		setIsMenuOpen(false);
		await authClient.signOut();
		await navigate({ to: "/" });
	}

	const authActions = session ? (
		<UserMenu
			name={session.user.name || session.user.email}
			email={session.user.email}
			onSignOut={signOut}
			onNavigate={() => setIsMenuOpen(false)}
		/>
	) : (
		<>
			<Button
				variant="outline"
				nativeButton={false}
				render={<Link to="/auth/login" />}
				onClick={() => setIsMenuOpen(false)}
			>
				Login
			</Button>
			<Button
				nativeButton={false}
				render={<Link to="/auth/register" search={{ source: "business" }} />}
				onClick={() => setIsMenuOpen(false)}
			>
				Register
			</Button>
		</>
	);

	return (
		<>
			<header className="sticky top-0 z-50 h-(--header-h) border-b border-(--line) bg-(--header-bg) backdrop-blur-lg">
				<nav className="page-wrap flex h-full items-center gap-x-3">
					<div className="flex flex-1">
						<Link
							to="/"
							className="shrink-0 text-(--sea-ink)"
							onClick={() => setIsMenuOpen(false)}
						>
							<SinwyLogo className="h-5 w-auto sm:h-6" />
						</Link>
					</div>

					<div className="hidden items-center gap-1 lg:flex">
						<NavLinks linkClassName="nav-link" />
					</div>

					<div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
						<ThemeToggle />
						<div className="hidden items-center gap-1.5 lg:flex sm:gap-2">
							{authActions}
						</div>
						<Button
							variant="secondary"
							size="icon"
							className="lg:hidden"
							aria-label={isMenuOpen ? "Close menu" : "Open menu"}
							aria-expanded={isMenuOpen}
							aria-controls="mobile-nav"
							onClick={() => setIsMenuOpen((open) => !open)}
						>
							{isMenuOpen ? <X /> : <Menu />}
						</Button>
					</div>
				</nav>
			</header>

			{isMenuOpen ? (
				<div
					id="mobile-nav"
					className="nav-overlay animate-fade-in fixed inset-x-0 bottom-0 top-(--header-h) z-40 overflow-y-auto lg:hidden"
				>
					<div className="page-wrap flex flex-col gap-2 py-6">
						<NavLinks
							linkClassName="nav-link rounded-xl px-4 py-3 text-lg"
							onNavigate={() => setIsMenuOpen(false)}
						/>
						{session ? (
							<MobileUserMenu
								name={session.user.name || session.user.email}
								email={session.user.email}
								onSignOut={signOut}
								onNavigate={() => setIsMenuOpen(false)}
							/>
						) : (
							<div className="mt-4 flex flex-col gap-2 [&>button]:h-11 [&>a]:h-11">
								{authActions}
							</div>
						)}
					</div>
				</div>
			) : null}
		</>
	);
};

export default Header;
