import type { PageDetailDto } from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, InfoIcon } from "lucide-react";
import {
	pagesQuery,
	publishPage,
	storePage,
	unpublishPage,
} from "#/modules/org-dashboard/lib/page-queries";
import {
	PAGE_STATE_LABELS,
	pageState,
	publicPagePath,
} from "#/modules/org-dashboard/lib/pages";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { UpgradeAction } from "#/shared/components/UpgradePrompt";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "#/shared/components/ui/alert";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { Label } from "#/shared/components/ui/label";
import { Switch } from "#/shared/components/ui/switch";
import { toast } from "#/shared/components/ui/toast";

const STATE_BADGES = {
	live: "secondary",
	draft: "outline",
	"not-live": "destructive",
} as const;

export function PagePublishing({
	organization,
	page,
	canWrite,
}: {
	organization: { id: string; slug: string };
	page: PageDetailDto;
	canWrite: boolean;
}) {
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const usage = useQuery(pagesQuery(organization.id)).data?.usage;
	const state = pageState(page);
	const path = publicPagePath(organization.slug, page.slug);

	const write = useMutation({
		mutationFn: async (action: "publish" | "unpublish" | "update") =>
			unwrap(
				await (action === "unpublish" ? unpublishPage : publishPage)(
					organization.id,
					page.id,
				),
			),
		onSuccess: async (saved, action) => {
			await storePage(queryClient, organization.id, saved);
			toast.add({
				type: "success",
				title:
					action === "unpublish"
						? "Page unpublished"
						: action === "update"
							? "Changes published"
							: "Page published",
				timeout: 4_000,
			});
		},
		onError: (error) => {
			if (error.message)
				toast.add({ type: "error", title: error.message, timeout: 6_000 });
		},
	});

	const published = page.status === "published";

	return (
		<SettingsSection
			id="publishing"
			title="Publishing"
			description="A published page is public at its address. Edits stay private until you publish them."
			action={
				<Badge variant={STATE_BADGES[state]}>{PAGE_STATE_LABELS[state]}</Badge>
			}
		>
			{canWrite && (
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<Switch
							id="page-published"
							checked={published}
							disabled={write.isPending}
							onCheckedChange={(checked) =>
								write.mutate(checked ? "publish" : "unpublish")
							}
						/>
						<Label htmlFor="page-published">Published</Label>
					</div>
					{published && page.hasUnpublishedChanges && (
						<Button
							type="button"
							variant="outline"
							disabled={write.isPending}
							onClick={() => write.mutate("update")}
						>
							Publish changes
						</Button>
					)}
				</div>
			)}

			{published && (
				<p className="text-muted-foreground text-sm">
					{page.publishedAt &&
						`Published ${formatDistanceToNow(page.publishedAt, { addSuffix: true })}, version ${page.publishedVersion}.`}
					{page.hasUnpublishedChanges &&
						" The draft has changes that aren't public yet."}
				</p>
			)}

			{state === "live" && (
				<a
					href={path}
					target="_blank"
					rel="noreferrer"
					className="inline-flex w-fit items-center gap-1 text-sm hover:underline"
				>
					{path}
					<ExternalLinkIcon className="size-3.5" aria-hidden />
					<span className="sr-only">(opens in a new tab)</span>
				</a>
			)}

			{state === "not-live" && (
				<Alert className="rounded-md">
					<InfoIcon />
					<AlertTitle>
						Published, not live: over your plan's page limit
					</AlertTitle>
					<AlertDescription className="grid gap-3">
						<p>
							Your plan keeps only its oldest{" "}
							{usage
								? `${usage.limit} published ${usage.limit === 1 ? "page" : "pages"}`
								: "published pages"}{" "}
							online. This one comes back once an older page is deleted or
							unpublished, or after an upgrade.
						</p>
						<div>
							<UpgradeAction />
						</div>
					</AlertDescription>
				</Alert>
			)}
		</SettingsSection>
	);
}
