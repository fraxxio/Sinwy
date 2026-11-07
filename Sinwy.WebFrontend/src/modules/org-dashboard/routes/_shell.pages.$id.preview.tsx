import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EyeIcon } from "lucide-react";
import { pageQuery } from "#/modules/org-dashboard/lib/page-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageRenderer } from "#/shared/components/page-content/PageRenderer";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "#/shared/components/ui/alert";
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

	if (page.isPending) return <Skeleton className="h-96 rounded-xl" />;
	if (page.isError) return <FieldError>{page.error.message}</FieldError>;

	const { latestVersion } = page.data;
	const isPublishedVersion =
		page.data.publishedVersion === latestVersion.version;

	return (
		<>
			<Alert>
				<EyeIcon />
				<AlertTitle>
					{isPublishedVersion
						? "Preview — the published version"
						: "Preview — not published"}
				</AlertTitle>
				<AlertDescription>
					{page.data.title}, version {latestVersion.version}.{" "}
					{isPublishedVersion
						? "This is the version that's published."
						: "Only your team can see this until it's published."}
				</AlertDescription>
				<AlertAction>
					<Button
						variant="outline"
						size="sm"
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
				</AlertAction>
			</Alert>
			<ContentBox className="p-6 sm:p-10">
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
