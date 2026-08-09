import { Fragment, type ReactNode } from "react";
import { AppSidebar } from "#/modules/dashboard/components/AppSidebar";
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

export type Breadcrumbs = { label: string; href?: string }[];

/** SidebarProvider persists its state to this cookie but never reads it back. */
const readSidebarCookie = () =>
	typeof document === "undefined" ||
	!/(?:^|;\s*)sidebar_state=false(?:;|$)/.test(document.cookie);

/**
 * App shell for every dashboard page: collapsible sidebar, sticky header with
 * a breadcrumb trail, and the page body. Mount it once per layout route so the
 * sidebar keeps its open/collapsed state across navigations.
 */
export function DashboardLayout({
	breadcrumbs = [],
	children,
}: {
	breadcrumbs?: Breadcrumbs;
	children: ReactNode;
}) {
	return (
		<SidebarProvider defaultOpen={readSidebarCookie()}>
			<AppSidebar />
			<SidebarInset>
				<header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
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
										<Fragment key={crumb.label}>
											{index > 0 && (
												<BreadcrumbSeparator className="hidden md:block" />
											)}
											<BreadcrumbItem
												className={isLast ? undefined : "hidden md:block"}
											>
												{isLast || !crumb.href ? (
													<BreadcrumbPage>{crumb.label}</BreadcrumbPage>
												) : (
													<BreadcrumbLink href={crumb.href}>
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
