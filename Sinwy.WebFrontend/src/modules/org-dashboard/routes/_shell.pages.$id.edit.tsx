import {
	API_ERROR_CODES,
	hasPermission,
	type PageDetailDto,
	type PageListItemDto,
	type ServiceDto,
} from "@sinwy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import {
	lazy,
	type ReactNode,
	Suspense,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	type Autosave,
	createAutosave,
	type SaveFn,
} from "#/modules/org-dashboard/components/page-editor/autosave";
import { shrinkImage } from "#/modules/org-dashboard/components/page-editor/images";
import {
	discardAfterSave,
	publishAfterSave,
} from "#/modules/org-dashboard/components/page-editor/publishing";
import {
	type PageData,
	saveErrorMessage,
	toPageDocument,
} from "#/modules/org-dashboard/components/page-editor/save";
import {
	createUploads,
	type Uploads,
} from "#/modules/org-dashboard/components/page-editor/uploads";
import {
	discardDraft,
	pageQuery,
	pagesQuery,
	publishPage,
	savePageContent,
	storePage,
	uploadPageImage,
} from "#/modules/org-dashboard/lib/page-queries";
import { publicPagePath } from "#/modules/org-dashboard/lib/pages";
import { servicesQuery } from "#/modules/org-dashboard/lib/service-queries";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { organizationsQuery } from "#/shared/lib/organizations";

const PageEditor = lazy(() =>
	import("#/modules/org-dashboard/components/page-editor/PageEditor").then(
		(module) => ({ default: module.PageEditor }),
	),
);

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/pages/$id/edit",
)({
	staticData: { crumb: "Edit", fullWindow: true },
	component: PageEditPage,
});

const loading = (
	<div className="h-svh bg-background p-6">
		<Skeleton className="size-full rounded-md" />
	</div>
);

function PageEditPage() {
	const { id } = Route.useParams();
	const { organization, member } = Route.useRouteContext();
	const canWrite = hasPermission(member.roles, "pages:write");
	const page = useQuery({
		...pageQuery(organization.id, id),
		enabled: canWrite,
	});
	const services = useQuery({
		...servicesQuery(organization.id),
		enabled: canWrite,
	});
	const livePages = useQuery({
		...pagesQuery(organization.id),
		enabled: canWrite,
		select: (list) => list.items.filter((item) => item.live),
	});
	// A new key opens a fresh editor on the page's cached document, refetched first when asked
	const [opened, setOpened] = useState(0);
	const reopen = async ({ refetch }: { refetch: boolean }) => {
		if (refetch) await page.refetch();
		setOpened((count) => count + 1);
	};

	const back = (
		<Button
			variant="ghost"
			nativeButton={false}
			render={
				<Link
					to="/dashboard/$organizationSlug/pages/$id"
					params={{ organizationSlug: organization.slug, id }}
				/>
			}
		>
			<ArrowLeftIcon />
			Back
		</Button>
	);

	if (!canWrite || page.isError)
		return (
			<div className="grid h-svh place-content-center justify-items-center gap-4 bg-background">
				<FieldError>
					{page.isError
						? page.error.message
						: "You don't have permission to edit pages."}
				</FieldError>
				{back}
			</div>
		);
	if (page.isPending || services.isPending || livePages.isPending)
		return loading;

	return (
		<Suspense fallback={loading}>
			<EditorScreen
				key={`${page.data.id}:${opened}`}
				page={page.data}
				services={services.data ?? []}
				livePages={livePages.data ?? []}
				back={back}
				reopen={reopen}
			/>
		</Suspense>
	);
}

function EditorScreen({
	page,
	services,
	livePages,
	back,
	reopen,
}: {
	page: PageDetailDto;
	services: ServiceDto[];
	livePages: PageListItemDto[];
	back: ReactNode;
	reopen: (options: { refetch: boolean }) => Promise<void>;
}) {
	const { organization, entitlements } = Route.useRouteContext();
	const queryClient = useQueryClient();
	const { data: branding } = useQuery({
		...organizationsQuery,
		select: (organizations) =>
			organizations.find((org) => org.id === organization.id)?.branding,
	});
	// Puck owns the document from here on; the query's later answers don't reset it
	const [initialData] = useState(() => page.latestVersion.content.data);
	const latest = useRef(page.latestVersion);

	const save: SaveFn = async (data, base) => {
		const attempted = toPageDocument(data);
		const res = await savePageContent(organization.id, page.id, {
			baseVersion: base,
			content: attempted,
		});
		if (!res.isSuccess)
			return {
				ok: false,
				code: res.code,
				message: saveErrorMessage(res, {
					saved: latest.current.content,
					attempted,
					features: entitlements.features,
				}),
			};
		latest.current = res.data.latestVersion;
		void storePage(queryClient, organization.id, res.data);
		return { ok: true, base: res.data.latestVersion.version };
	};
	// Made in an effect, so StrictMode's second mount gets engines that aren't disposed
	const [engines, setEngines] = useState<{
		autosave: Autosave;
		uploads: Uploads;
	} | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: one engine per mount, holding the document it opened with
	useEffect(() => {
		const autosave = createAutosave({
			data: initialData,
			base: page.latestVersion.version,
			save,
		});
		const uploads = createUploads({
			prepare: shrinkImage,
			upload: (image, signal) =>
				uploadPageImage(organization.id, image, signal),
		});
		setEngines({ autosave, uploads });
		return () => {
			uploads.dispose();
			autosave.dispose();
		};
	}, []);

	if (!engines) return loading;
	const { autosave, uploads } = engines;

	const keepMine = async () => {
		try {
			const fresh = await queryClient.fetchQuery({
				...pageQuery(organization.id, page.id),
				staleTime: 0,
			});
			latest.current = fresh.latestVersion;
			await autosave.resolveConflict(fresh.latestVersion.version);
		} catch (error) {
			toast.add({
				type: "error",
				title: "Couldn't load the latest version",
				description: error instanceof Error ? error.message : undefined,
				timeout: 6_000,
			});
		}
	};
	const publish = async (read: () => PageData) => {
		const outcome = await publishAfterSave(
			autosave,
			uploads,
			read,
			(baseVersion) => publishPage(organization.id, page.id, { baseVersion }),
		);
		if (!outcome.ok) {
			toast.add({
				type: "error",
				title: "Not published",
				description: outcome.message,
				timeout: 10_000,
			});
			return;
		}
		latest.current = outcome.page.latestVersion;
		await storePage(queryClient, organization.id, outcome.page);
		toast.add({
			type: "success",
			title:
				page.status === "published" ? "Changes published" : "Page published",
			description: outcome.page.live
				? "Customers see it now."
				: "It isn't live yet: your plan's page limit is reached.",
			timeout: 6_000,
		});
	};
	const discard = async (data: PageData) => {
		uploads.abort();
		const outcome = await discardAfterSave(autosave, data, (baseVersion) =>
			discardDraft(organization.id, page.id, { baseVersion }),
		);
		if (!outcome.ok) {
			const moved =
				outcome.code === API_ERROR_CODES.PAGE_VERSION_CONFLICT ||
				outcome.code === API_ERROR_CODES.PAGE_NOT_PUBLISHED;
			toast.add({
				type: "error",
				title: "Changes not discarded",
				description: moved
					? "This page changed somewhere else. The editor now shows its latest version."
					: outcome.message,
				timeout: 10_000,
			});
			if (moved) await reopen({ refetch: true });
			return;
		}
		await storePage(queryClient, organization.id, outcome.page);
		await reopen({ refetch: false });
		toast.add({
			type: "success",
			title: "Changes discarded",
			description: "The page is back to what's live.",
			timeout: 6_000,
		});
	};

	return (
		<PageEditor
			data={initialData}
			metadata={{
				organizationSlug: organization.slug,
				services: services.filter((service) => service.isActive),
				branding: branding ?? null,
				pageAddresses: new Map(livePages.map((p) => [p.id, p.slug])),
			}}
			otherPages={livePages.filter((p) => p.id !== page.id)}
			title={page.title}
			path={publicPagePath(organization.slug, page.slug)}
			back={back}
			autosave={autosave}
			uploads={uploads}
			conflict={{
				keepMine,
				loadLatest: () => {
					uploads.abort();
					return reopen({ refetch: true });
				},
			}}
			publishing={{
				page,
				organizationSlug: organization.slug,
				publish,
				discard,
			}}
		/>
	);
}
