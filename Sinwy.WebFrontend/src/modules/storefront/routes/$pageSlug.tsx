import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { FileXIcon } from "lucide-react";
import {
	publicPageQuery,
	storefrontQuery,
} from "#/modules/storefront/lib/storefront-queries";
import { useTrackEvent } from "#/modules/storefront/lib/track";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageRenderer } from "#/shared/components/page-content/PageRenderer";
import { brandAttributes } from "#/shared/lib/branding";
import { cn } from "#/shared/lib/utils";

export const Route = createFileRoute("/$organizationSlug/$pageSlug")({
	loader: async ({ params, context }) => {
		const [page] = await Promise.all([
			context.queryClient.ensureQueryData(
				publicPageQuery(params.organizationSlug, params.pageSlug),
			),
			context.queryClient.ensureQueryData(
				storefrontQuery(params.organizationSlug),
			),
		]);
		if (!page) throw notFound();
		return page;
	},
	head: ({ loaderData: page }) => ({
		meta: page
			? [
					{ title: page.seoTitle },
					...(page.seoDescription
						? [{ name: "description", content: page.seoDescription }]
						: []),
				]
			: [{ title: "Page not available" }],
	}),
	component: PublicPage,
	notFoundComponent: PageUnavailable,
});

function PageUnavailable() {
	return (
		<EmptyState
			icon={<FileXIcon />}
			title="This page isn't available"
			description="The link may be wrong, or the page isn't published right now."
		/>
	);
}

function PublicPage() {
	const { organizationSlug, pageSlug } = Route.useParams();
	const { data: page } = useSuspenseQuery(
		publicPageQuery(organizationSlug, pageSlug),
	);
	const { data: storefront } = useSuspenseQuery(
		storefrontQuery(organizationSlug),
	);
	useTrackEvent(organizationSlug, "view", pageSlug);
	if (!page) return <PageUnavailable />;

	return (
		<article
			{...brandAttributes(page.organization.branding)}
			className={cn(
				"mx-auto w-full space-y-8",
				page.content.schemaVersion === 1 && "max-w-3xl",
			)}
		>
			<Link
				to="/$organizationSlug/book"
				params={{ organizationSlug: page.organization.slug }}
				className="font-medium text-muted-foreground text-sm hover:text-foreground"
			>
				{page.organization.name}
			</Link>
			<PageRenderer
				content={page.content}
				organizationSlug={page.organization.slug}
				services={storefront?.services}
			/>
		</article>
	);
}
