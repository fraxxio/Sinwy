import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "#/modules/auth/lib/auth-client.ts";
import { Button } from "#/shared/components/ui/button.tsx";
import SinwyLogo from "./SinwyLogo.tsx";
import ThemeToggle from "./ThemeToggle.tsx";

const NAV_ITEMS = [
	{ label: "Products", href: "#products" },
	{ label: "Solutions", href: "#solutions" },
	{ label: "About us", to: "/about" },
	{ label: "Pricing", href: "#pricing" },
] as const;

type NavLinksProps = {
	linkClassName: string;
	onNavigate?: () => void;
};

const NavLinks = ({ linkClassName, onNavigate }: NavLinksProps) =>
	NAV_ITEMS.map((item) =>
		"to" in item ? (
			<Link
				key={item.label}
				to={item.to}
				className={linkClassName}
				activeProps={{ className: `${linkClassName} is-active` }}
				onClick={onNavigate}
			>
				{item.label}
			</Link>
		) : (
			<a
				key={item.label}
				href={item.href}
				className={linkClassName}
				onClick={onNavigate}
			>
				{item.label}
			</a>
		),
	);

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
		<>
			<span className="hidden text-sm text-muted-foreground sm:inline">
				{session.user.name || session.user.email}
			</span>
			<Button variant="outline" onClick={signOut}>
				Sign out
			</Button>
		</>
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
						<div className="mt-4 flex flex-col gap-2 [&>button]:h-11 [&>a]:h-11">
							{authActions}
						</div>
					</div>
				</div>
			) : null}
		</>
	);
};

export default Header;
