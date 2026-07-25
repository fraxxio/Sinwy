import { Link, useNavigate } from "@tanstack/react-router";
import { authClient } from "#/modules/auth/lib/auth-client.ts";
import { Button } from "#/shared/components/ui/button.tsx";
import ThemeToggle from "./ThemeToggle.tsx";

const Header = () => {
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();

	return (
		<header className="sticky top-0 z-50 border-b border-(--line) bg-(--header-bg) backdrop-blur-lg">
			<nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
				<h2 className="m-0 shrink-0 text-base font-semibold tracking-tight">
					<Link
						to="/"
						className="inline-flex items-center gap-2 rounded-full border border-(--chip-line) bg-(--chip-bg) px-3 py-1.5 text-sm text-(--sea-ink) no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
					>
						Sinwy
					</Link>
				</h2>

				<div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-0 sm:w-auto sm:flex-nowrap sm:pb-0">
					<Link
						to="/"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						Home
					</Link>
					<Link
						to="/about"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						About
					</Link>
				</div>

				<div className="ml-auto flex items-center gap-1.5 sm:gap-2">
					<ThemeToggle />
					{session ? (
						<>
							<span className="hidden text-sm text-muted-foreground sm:inline">
								{session.user.name || session.user.email}
							</span>
							<Button
								variant="outline"
								onClick={async () => {
									await authClient.signOut();
									await navigate({ to: "/" });
								}}
							>
								Sign out
							</Button>
						</>
					) : (
						<>
							<Button
								variant="outline"
								nativeButton={false}
								render={<Link to="/auth/login" />}
							>
								Login
							</Button>
							<Button
								nativeButton={false}
								render={
									<Link to="/auth/register" search={{ source: "business" }} />
								}
							>
								Register
							</Button>
						</>
					)}
				</div>
			</nav>
		</header>
	);
};

export default Header;
