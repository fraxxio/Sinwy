import {
	Link,
	type LinkOptions,
	useMatches,
	useRouter,
} from "@tanstack/react-router";
import { Fragment, type ReactNode, useEffect } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "#/shared/components/ui/breadcrumb";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "#/shared/components/ui/sidebar";

export type Crumb = { label: string; link: LinkOptions };

function CloseSheetOnNavigation() {
	const router = useRouter();
	const { setOpenMobile } = useSidebar();
	useEffect(
		() => router.subscribe("onResolved", () => setOpenMobile(false)),
		[router, setOpenMobile],
	);
	return null;
}

/** SidebarProvider persists its state to this cookie but never reads it back. */
const readSidebarCookie = () =>
	typeof document === "undefined" ||
	!/(?:^|;\s*)sidebar_state=false(?:;|$)/.test(document.cookie);

/**
 * App shell for every dashboard page: collapsible sidebar, a breadcrumb row
 * that scrolls with the page, and the page body. Pages render a `PageHeader`
 * followed by one `ContentBox`. Mount it once per layout route so the sidebar
 * keeps its open/collapsed state across navigations.
 *
 * The trail starts at `rootCrumb` (runtime data, e.g. the organization name)
 * followed by every matched route that declares `staticData.crumb`. Sections
 * with child pages declare the crumb on a layout route (`_shell.bookings.tsx`)
 * so detail pages inherit it; their index routes must not declare one, or the
 * section (or root) crumb would appear twice.
 *
 * `banner` is for state of the whole shell (e.g. an inactive organization),
 * not notifications: it stays pinned above the page body until the state ends.
 */
export function AppShell({
	sidebar,
	rootCrumb,
	banner,
	children,
}: {
	sidebar: ReactNode;
	rootCrumb: Crumb;
	banner?: ReactNode;
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
			<CloseSheetOnNavigation />
			{sidebar}
			<SidebarInset className="min-w-0">
				<header className="mt-1 flex h-12 shrink-0 items-center px-5 md:pl-3 print:hidden">
					<div className="flex items-center gap-1">
						<SidebarTrigger className="-ml-1.5 size-7 text-muted-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent [&_svg:not([class*='size-'])]:size-3.5" />
						<Breadcrumb>
							<BreadcrumbList className="gap-1.5 text-[13px] sm:gap-1.5">
								{breadcrumbs.map((crumb, index) => {
									const isLast = index === breadcrumbs.length - 1;
									return (
										<Fragment key={String(crumb.link.to)}>
											{index > 0 && (
												<BreadcrumbSeparator className="hidden text-muted-foreground/60 md:block">
													/
												</BreadcrumbSeparator>
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
				{banner && (
					<div
						role="status"
						className="sticky top-0 z-[1] mb-4 bg-background print:hidden"
					>
						{banner}
					</div>
				)}
				<div className="flex flex-1 flex-col gap-4 px-2 pb-2 md:pl-0">
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
