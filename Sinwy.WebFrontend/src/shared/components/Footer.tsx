import { Link } from "@tanstack/react-router";
import NavLinks from "#/shared/components/NavLinks.tsx";
import SinwyLogo from "./SinwyLogo.tsx";

const Footer = () => {
	const year = new Date().getFullYear();

	return (
		<footer className="mt-20 border-t border-(--line) text-(--sea-ink-soft)">
			<div className="page-wrap flex flex-col gap-10 py-12 sm:flex-row sm:justify-between">
				<div className="flex flex-col items-start gap-4">
					<Link to="/" className="text-(--sea-ink)">
						<SinwyLogo className="h-6 w-auto" />
					</Link>
					<p className="m-0 max-w-64 text-sm">
						Everything your service business needs to get found and booked
						online.
					</p>
				</div>
				<nav
					aria-label="Footer"
					className="flex flex-col items-start gap-1 sm:items-end"
				>
					<NavLinks linkClassName="nav-link" />
				</nav>
			</div>
			<div className="border-t border-(--line-soft)">
				<p className="page-wrap m-0 py-5 text-sm">
					&copy; {year} Sinwy. All rights reserved.
				</p>
			</div>
		</footer>
	);
};

export default Footer;
