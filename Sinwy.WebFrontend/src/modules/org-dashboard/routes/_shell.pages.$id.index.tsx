import { hasPermission } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DeletePageButton } from "#/modules/org-dashboard/components/pages/DeletePageButton";
import { PageContentSummary } from "#/modules/org-dashboard/components/pages/PageContentSummary";
import { PageDetailsForm } from "#/modules/org-dashboard/components/pages/PageDetailsForm";
import { PagePublishing } from "#/modules/org-dashboard/components/pages/PagePublishing";
import { pageQuery } from "#/modules/org-dashboard/lib/page-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/pages/$id/",
)({
	component: PageDetailPage,
});

function PageDetailPage() {
	const { id } = Route.useParams();
	const { organization, member } = Route.useRouteContext();
	const canWrite = hasPermission(member.roles, "pages:write");
	const page = useQuery(pageQuery(organization.id, id));

	if (page.isPending)
		return (
			<>
				<PageHeader title="Page" />
				<ContentBox>
					<Skeleton className="h-96 max-w-3xl rounded-md" />
				</ContentBox>
			</>
		);
	if (page.isError)
		return (
			<>
				<PageHeader title="Page" />
				<ContentBox>
					<FieldError>{page.error.message}</FieldError>
				</ContentBox>
			</>
		);

	return (
		<>
			<PageHeader
				title={page.data.title}
				action={
					canWrite && (
						<DeletePageButton organization={organization} page={page.data} />
					)
				}
			/>
			<ContentBox className="divide-y">
				<PagePublishing
					organization={organization}
					page={page.data}
					canWrite={canWrite}
				/>
				<PageContentSummary
					organizationSlug={organization.slug}
					page={page.data}
				/>
				<PageDetailsForm
					key={page.data.id}
					organization={organization}
					page={page.data}
					readOnly={!canWrite}
				/>
			</ContentBox>
		</>
	);
}
