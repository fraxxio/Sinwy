import { Link, type LinkOptions, useMatches } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/shared/components/ui/breadcrumb";
import { Separator } from "#/shared/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/shared/components/ui/sidebar";

export type Crumb = { label: string; link: LinkOptions };

/** SidebarProvider persists its state to this cookie but never reads it back. */
const readSidebarCookie = () =>
	typeof document === "undefined" ||
	!/(?:^|;\s*)sidebar_state=false(?:;|$)/.test(document.cookie);

/**
 * App shell for every dashboard page: collapsible sidebar, sticky header with
 * a breadcrumb trail, and the page body. Mount it once per layout route so the
 * sidebar keeps its open/collapsed state across navigations.
 *
 * The trail starts at `rootCrumb` (runtime data, e.g. the organization name)
 * followed by every matched route that declares `staticData.crumb`. Sections
 * with child pages declare the crumb on a layout route (`_shell.bookings.tsx`)
 * so detail pages inherit it; their index routes must not declare one, or the
 * section (or root) crumb would appear twice.
 */
export function AppShell({
	sidebar,
	rootCrumb,
	children,
}: {
	sidebar: ReactNode;
	rootCrumb: Crumb;
	children: ReactNode;
}) {
	const matches = useMatches();
	const breadcrumbs: Crumb[] = [
		rootCrumb,
		...matches.flatMap((match) =>
			match.staticData.crumb
				? [
						{
							label: match.staticData.crumb,
							link: { to: match.fullPath, params: match.params } as LinkOptions,
						},
					]
				: [],
		),
	];

	return (
		<SidebarProvider defaultOpen={readSidebarCookie()}>
			{sidebar}
			<SidebarInset>
				<header className="chrome-edge relative z-[1] flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
					<div className="flex items-center gap-2 px-4">
						<SidebarTrigger className="-ml-1" />
						<Separator
							orientation="vertical"
							className="mr-2 data-vertical:h-4 data-vertical:self-auto"
						/>
						<Breadcrumb>
							<BreadcrumbList>
								{breadcrumbs.map((crumb, index) => {
									const isLast = index === breadcrumbs.length - 1;
									return (
										<Fragment key={String(crumb.link.to)}>
											{index > 0 && (
												<BreadcrumbSeparator className="hidden md:block" />
											)}
											<BreadcrumbItem
												className={isLast ? undefined : "hidden md:block"}
											>
												{isLast ? (
													<BreadcrumbPage>{crumb.label}</BreadcrumbPage>
												) : (
													<BreadcrumbLink render={<Link {...crumb.link} />}>
														{crumb.label}
													</BreadcrumbLink>
												)}
											</BreadcrumbItem>
										</Fragment>
									);
								})}
							</BreadcrumbList>
						</Breadcrumb>
					</div>
				</header>
				<div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
