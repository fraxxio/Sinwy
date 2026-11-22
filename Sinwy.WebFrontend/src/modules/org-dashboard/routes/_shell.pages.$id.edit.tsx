import {
	hasPermission,
	type PageDetailDto,
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
import {
	saveErrorMessage,
	toPageDocument,
} from "#/modules/org-dashboard/components/page-editor/save";
import {
	pageQuery,
	savePageContent,
	storePage,
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
	// A new key opens a fresh editor on the latest document, after a conflict
	const [opened, setOpened] = useState(0);
	const loadLatest = async () => {
		await page.refetch();
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
	if (page.isPending || services.isPending) return loading;

	return (
		<Suspense fallback={loading}>
			<EditorScreen
				key={`${page.data.id}:${opened}`}
				page={page.data}
				services={services.data ?? []}
				back={back}
				loadLatest={loadLatest}
			/>
		</Suspense>
	);
}

function EditorScreen({
	page,
	services,
	back,
	loadLatest,
}: {
	page: PageDetailDto;
	services: ServiceDto[];
	back: ReactNode;
	loadLatest: () => Promise<void>;
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
	// Made in an effect, so StrictMode's second mount gets an engine that isn't disposed
	const [autosave, setAutosave] = useState<Autosave | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: one engine per mount, holding the document it opened with
	useEffect(() => {
		const engine = createAutosave({
			data: initialData,
			base: page.latestVersion.version,
			save,
		});
		setAutosave(engine);
		return engine.dispose;
	}, []);

	if (!autosave) return loading;

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
	return (
		<PageEditor
			data={initialData}
			metadata={{
				organizationSlug: organization.slug,
				services: services.filter((service) => service.isActive),
				branding: branding ?? null,
			}}
			title={page.title}
			path={publicPagePath(organization.slug, page.slug)}
			back={back}
			autosave={autosave}
			conflict={{ keepMine, loadLatest }}
		/>
	);
}
