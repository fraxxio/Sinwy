import { Link } from "@tanstack/react-router";
import { NAV_ITEMS } from "#/shared/lib/constants";

type NavLinksProps = {
	linkClassName: string;
	onNavigate?: () => void;
};

const NavLinks = ({ linkClassName, onNavigate }: NavLinksProps) => {
	return (
		<>
			{NAV_ITEMS.map((item) =>
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
			)}
		</>
	);
};

export default NavLinks;
