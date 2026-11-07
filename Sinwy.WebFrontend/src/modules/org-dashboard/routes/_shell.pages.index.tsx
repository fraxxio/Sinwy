import { hasPermission } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { PagesTable } from "#/modules/org-dashboard/components/pages/PagesTable";
import {
	PageLimitNotice,
	PageUsageMeter,
} from "#/modules/org-dashboard/components/pages/PageUsage";
import { pagesQuery } from "#/modules/org-dashboard/lib/page-queries";
import { isAtPageLimit } from "#/modules/org-dashboard/lib/pages";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/pages/",
)({
	component: PagesPage,
});

function PagesPage() {
	const { organization, member } = Route.useRouteContext();
	const canWrite = hasPermission(member.roles, "pages:write");
	const pages = useQuery(pagesQuery(organization.id));

	const atLimit = !!pages.data && isAtPageLimit(pages.data.usage);
	const createButton = (label: string) =>
		atLimit ? (
			<Button disabled>
				<PlusIcon />
				{label}
			</Button>
		) : (
			<Button
				nativeButton={false}
				render={
					<Link
						to="/dashboard/$organizationSlug/pages/new"
						params={{ organizationSlug: organization.slug }}
					/>
				}
			>
				<PlusIcon />
				{label}
			</Button>
		);

	const hasPages = !!pages.data?.items.length;

	return (
		<>
			<PageHeader
				title="Pages"
				description="The public pages your customers see."
				action={
					pages.data && (
						<div className="flex items-center gap-4">
							<PageUsageMeter usage={pages.data.usage} />
							{canWrite && hasPages && createButton("New page")}
						</div>
					)
				}
			/>
			{pages.isPending ? (
				<Skeleton className="h-48 rounded-xl" />
			) : pages.isError ? (
				<FieldError>{pages.error.message}</FieldError>
			) : (
				<>
					<PageLimitNotice
						usage={pages.data.usage}
						pages={pages.data.items}
						canWrite={canWrite}
					/>
					{hasPages ? (
						<ContentBox className="p-4">
							<PagesTable
								organizationSlug={organization.slug}
								pages={pages.data.items}
							/>
						</ContentBox>
					) : (
						<EmptyState
							icon={<FileTextIcon />}
							title="No pages yet"
							description={
								canWrite
									? "Build a page from a template to give your organization a public presence."
									: "Once an owner or admin adds pages, they show up here."
							}
							action={canWrite && createButton("Create your first page")}
						/>
					)}
				</>
			)}
		</>
	);
}
