import { hasPermission, type PuckDocument } from "@sinwy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	pageQuery,
	savePageContent,
	storePage,
} from "#/modules/org-dashboard/lib/page-queries";
import { activeServicesQuery } from "#/modules/org-dashboard/lib/service-queries";
import { editorConfigFor } from "#/shared/components/page-builder/editor-config";
import { PageEditor } from "#/shared/components/page-builder/PageEditor";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { organizationsQuery } from "#/shared/lib/organizations";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/pages/$id/edit",
)({
	staticData: { crumb: "Edit" },
	component: PageEditPage,
});

function PageEditPage() {
	const { id } = Route.useParams();
	const { organization, member, entitlements } = Route.useRouteContext();
	const queryClient = useQueryClient();
	const page = useQuery(pageQuery(organization.id, id));
	const services = useQuery(activeServicesQuery(organization.id));
	const { data: branding } = useQuery({
		...organizationsQuery,
		select: (organizations) =>
			organizations.find((org) => org.id === organization.id)?.branding,
	});
	const [baseVersion, setBaseVersion] = useState<number | null>(null);

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
			Back
		</Button>
	);

	if (page.isPending || services.isPending)
		return (
			<div className="fixed inset-0 z-50 bg-background p-6">
				<Skeleton className="size-full rounded-md" />
			</div>
		);
	if (page.isError || !hasPermission(member.roles, "pages:write"))
		return (
			<div className="fixed inset-0 z-50 grid place-content-center gap-4 bg-background">
				<FieldError>
					{page.isError
						? page.error.message
						: "You don't have permission to edit pages."}
				</FieldError>
				{backButton}
			</div>
		);

	const { latestVersion } = page.data;
	const save = async (data: PuckDocument) => {
		const res = await savePageContent(organization.id, id, {
			baseVersion: baseVersion ?? latestVersion.version,
			content: { schemaVersion: 2, data },
		});
		if (!res.isSuccess) return { ok: false, message: res.message } as const;
		setBaseVersion(res.data.latestVersion.version);
		await storePage(queryClient, organization.id, res.data);
		return { ok: true } as const;
	};

	return (
		<div className="fixed inset-0 z-50 bg-background">
			<PageEditor
				key={page.data.id}
				config={editorConfigFor(entitlements.features)}
				initialData={
					latestVersion.content.schemaVersion === 2
						? latestVersion.content.data
						: null
				}
				title={page.data.title}
				path={`/${organization.slug}/${page.data.slug}`}
				actions={backButton}
				metadata={{
					organizationSlug: organization.slug,
					services: services.data ?? [],
					branding,
				}}
				onSave={save}
			/>
		</div>
	);
}
