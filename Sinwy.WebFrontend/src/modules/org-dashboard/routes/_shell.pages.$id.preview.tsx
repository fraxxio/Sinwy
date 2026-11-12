import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { pageQuery } from "#/modules/org-dashboard/lib/page-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { PageRenderer } from "#/shared/components/page-content/PageRenderer";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/pages/$id/preview",
)({
	staticData: { crumb: "Preview" },
	component: PagePreviewPage,
});

function PagePreviewPage() {
	const { id } = Route.useParams();
	const { organization } = Route.useRouteContext();
	const page = useQuery(pageQuery(organization.id, id));

	const backButton = (
		<Button
			variant="outline"
			nativeButton={false}
			render={
				<Link
					to="/dashboard/$organizationSlug/pages/$id"
					params={{ organizationSlug: organization.slug, id }}
				/>
			}
		>
			Back to page
		</Button>
	);

	if (page.isPending)
		return (
			<>
				<PageHeader
					title="Preview"
					description="Loading the latest version…"
					action={backButton}
				/>
				<ContentBox>
					<Skeleton className="mx-auto h-96 w-full max-w-3xl rounded-md" />
				</ContentBox>
			</>
		);
	if (page.isError)
		return (
			<>
				<PageHeader title="Preview" action={backButton} />
				<ContentBox>
					<FieldError>{page.error.message}</FieldError>
				</ContentBox>
			</>
		);

	const { latestVersion } = page.data;
	const isPublishedVersion =
		page.data.publishedVersion === latestVersion.version;

	return (
		<>
			<PageHeader
				title="Preview"
				description={`${page.data.title}, version ${latestVersion.version}. ${
					isPublishedVersion
						? "This is the version that's published."
						: "Only your team can see this until it's published."
				}`}
				action={backButton}
			/>
			<ContentBox>
				{latestVersion.content.blocks.length ? (
					<div className="mx-auto max-w-3xl">
						<PageRenderer
							content={latestVersion.content}
							organizationSlug={organization.slug}
						/>
					</div>
				) : (
					<p className="text-center text-muted-foreground text-sm">
						This page has no content yet.
					</p>
				)}
			</ContentBox>
		</>
	);
}
