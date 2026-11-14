import type { ReactNode } from "react";
import { tabsListVariants } from "#/shared/components/ui/tabs";
import { cn } from "#/shared/lib/utils";

/** For the `Link`s of a `RouteTabs`; the active route is the selected tab. */
export const routeTabClassName =
	"inline-flex h-full items-center justify-center rounded-full border border-transparent px-3 py-1 font-medium text-foreground/60 text-sm whitespace-nowrap transition-all hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[status=active]:bg-background data-[status=active]:text-foreground dark:text-muted-foreground dark:data-[status=active]:border-input dark:data-[status=active]:bg-input/30 dark:data-[status=active]:text-foreground dark:hover:text-foreground";

/** Tabs that are routes: a nav styled as a tab list. */
export function RouteTabs({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<nav
			aria-label={label}
			className={cn(tabsListVariants(), "mx-3 h-9 max-w-full overflow-x-auto")}
		>
			{children}
		</nav>
	);
}
