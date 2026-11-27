import { resolvePageLinks } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
	pageQuery,
	pagesQuery,
} from "#/modules/org-dashboard/lib/page-queries";
import { servicesQuery } from "#/modules/org-dashboard/lib/service-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { PageDocumentView } from "#/shared/components/page-builder/PageDocumentView";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { organizationsQuery } from "#/shared/lib/organizations";

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
	const { data: branding } = useQuery({
		...organizationsQuery,
		select: (organizations) =>
			organizations.find((org) => org.id === organization.id)?.branding,
	});
	const { data: services = [] } = useQuery({
		...servicesQuery(organization.id),
		select: (list) => list.filter((service) => service.isActive),
	});
	const pageAddresses = useQuery({
		...pagesQuery(organization.id),
		select: (list) =>
			new Map(
				list.items
					.filter((item) => item.live)
					.map((item) => [item.id, item.slug]),
			),
	});

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

	if (page.isPending || pageAddresses.isPending)
		return (
			<>
				<PageHeader
					title="Preview"
					description="Loading the latest version…"
					action={backButton}
				/>
				<ContentBox>
					<Skeleton className="mx-auto h-96 w-full max-w-5xl rounded-md" />
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
		page.data.status === "published" && !page.data.hasUnpublishedChanges;

	return (
		<>
			<PageHeader
				title="Preview"
				description={`${page.data.title}, saved ${formatDistanceToNow(latestVersion.savedAt, { addSuffix: true })}. ${
					isPublishedVersion
						? "This is the version that's published."
						: "Only your team can see this until it's published."
				}`}
				action={backButton}
			/>
			<ContentBox>
				{latestVersion.content.data.content.length ? (
					<PageDocumentView
						document={resolvePageLinks(
							latestVersion.content,
							pageAddresses.data ?? new Map(),
						)}
						metadata={{
							organizationSlug: organization.slug,
							services,
							branding: branding ?? null,
						}}
					/>
				) : (
					<p className="text-center text-muted-foreground text-sm">
						This page has no content yet.
					</p>
				)}
			</ContentBox>
		</>
	);
}
