import type { BlockNode, PageDetailDto } from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, InfoIcon } from "lucide-react";
import { useState } from "react";
import {
	discardDraft,
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
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/shared/components/ui/alert-dialog";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { Label } from "#/shared/components/ui/label";
import { Switch } from "#/shared/components/ui/switch";
import { toast } from "#/shared/components/ui/toast";
import { PublishIssuesDialog } from "../page-editor/PublishIssuesDialog";
import {
	type PublishIssue,
	publishIssues,
} from "../page-editor/publish-checks";

type WriteAction = "publish" | "unpublish" | "update" | "discard";

const WRITE_TOASTS: Record<WriteAction, string> = {
	publish: "Page published",
	unpublish: "Page unpublished",
	update: "Changes published",
	discard: "Changes discarded",
};

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

	const [confirmingDiscard, setConfirmingDiscard] = useState(false);
	const [checked, setChecked] = useState<{
		action: "publish" | "update";
		issues: PublishIssue[];
	} | null>(null);

	const write = useMutation({
		mutationFn: async (action: WriteAction) => {
			const base = { baseVersion: page.latestVersion.version };
			return unwrap(
				await (action === "unpublish"
					? unpublishPage(organization.id, page.id)
					: action === "discard"
						? discardDraft(organization.id, page.id, base)
						: publishPage(organization.id, page.id, base)),
			);
		},
		onSuccess: async (saved, action) => {
			await storePage(queryClient, organization.id, saved);
			toast.add({
				type: "success",
				title: WRITE_TOASTS[action],
				timeout: 4_000,
			});
		},
		onSettled: () => {
			setConfirmingDiscard(false);
			setChecked(null);
		},
		onError: (error) => {
			if (error.message)
				toast.add({ type: "error", title: error.message, timeout: 6_000 });
		},
	});

	const published = page.status === "published";

	const checkThenPublish = (action: "publish" | "update") => {
		const issues = publishIssues(
			page.latestVersion.content.data.content as BlockNode[],
		);
		if (issues.length > 0) setChecked({ action, issues });
		else write.mutate(action);
	};

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
							onCheckedChange={(on) =>
								on ? checkThenPublish("publish") : write.mutate("unpublish")
							}
						/>
						<Label htmlFor="page-published">Published</Label>
					</div>
					{published && page.hasUnpublishedChanges && (
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="ghost"
								disabled={write.isPending}
								onClick={() => setConfirmingDiscard(true)}
							>
								Discard changes
							</Button>
							<Button
								type="button"
								variant="outline"
								disabled={write.isPending}
								onClick={() => checkThenPublish("update")}
							>
								Publish changes
							</Button>
						</div>
					)}
				</div>
			)}

			{published && (
				<p className="text-muted-foreground text-sm">
					{page.publishedAt &&
						`Published ${formatDistanceToNow(page.publishedAt, { addSuffix: true })}.`}
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

			<PublishIssuesDialog
				issues={checked?.issues ?? []}
				busy={write.isPending}
				onCancel={() => setChecked(null)}
				onPublish={() => checked && write.mutate(checked.action)}
				footer={
					<Link
						to="/dashboard/$organizationSlug/pages/$id/edit"
						params={{ organizationSlug: organization.slug, id: page.id }}
						className="w-fit text-primary text-sm underline underline-offset-4"
					>
						Open the editor
					</Link>
				}
			/>

			<AlertDialog
				open={confirmingDiscard}
				onOpenChange={(open) => !write.isPending && setConfirmingDiscard(open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Discard unpublished changes?</AlertDialogTitle>
						<AlertDialogDescription>
							The page goes back to what's live now. Every change since you last
							published is dropped. The live page doesn't change.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={write.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={write.isPending}
							onClick={() => write.mutate("discard")}
						>
							{write.isPending ? "Discarding…" : "Discard changes"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsSection>
	);
}
