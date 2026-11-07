import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NewPageForm } from "#/modules/org-dashboard/components/pages/NewPageForm";
import { PageLimitNotice } from "#/modules/org-dashboard/components/pages/PageUsage";
import { pagesQuery } from "#/modules/org-dashboard/lib/page-queries";
import { isAtPageLimit } from "#/modules/org-dashboard/lib/pages";
import { PageHeader } from "#/shared/components/PageHeader";
import { Button } from "#/shared/components/ui/button";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/pages/new",
)({
	beforeLoad: requirePermission("pages:write"),
	staticData: { crumb: "New page" },
	component: NewPagePage,
});

function NewPagePage() {
	const { organization } = Route.useRouteContext();
	const pages = useQuery(pagesQuery(organization.id));

	return (
		<>
			<PageHeader
				title="New page"
				description="Start from a template, then give the page a title."
			/>
			{pages.isPending ? (
				<Skeleton className="h-96 rounded-xl" />
			) : pages.data && isAtPageLimit(pages.data.usage) ? (
				<>
					<PageLimitNotice
						usage={pages.data.usage}
						pages={pages.data.items}
						canWrite
					/>
					<Button
						variant="outline"
						className="w-fit"
						nativeButton={false}
						render={
							<Link
								to="/dashboard/$organizationSlug/pages"
								params={{ organizationSlug: organization.slug }}
							/>
						}
					>
						Back to pages
					</Button>
				</>
			) : (
				<NewPageForm organization={organization} />
			)}
		</>
	);
}
