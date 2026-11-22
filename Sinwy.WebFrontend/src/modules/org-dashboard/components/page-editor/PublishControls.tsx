import { useGetPuck } from "@puckeditor/core";
import type { PageDetailDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	EDITOR_PAGE_STATE_LABELS,
	editorPageState,
} from "#/modules/org-dashboard/lib/pages";
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
import type { Autosave } from "./autosave";
import { useAutosaveState } from "./SaveControls";
import type { PageData } from "./save";

/** The page as the server last answered, and the editor's ways to make it public or drop its draft. */
export type Publishing = {
	page: PageDetailDto;
	organizationSlug: string;
	publish: (data: PageData) => Promise<void>;
	discard: (data: PageData) => Promise<void>;
};

const STATE_BADGES = {
	draft: "outline",
	live: "secondary",
	changed: "outline",
	"not-live": "destructive",
} as const;

const usePageState = (autosave: Autosave, page: PageDetailDto) => {
	const unsaved = useAutosaveState(autosave).status !== "saved";
	return {
		state: editorPageState(page, unsaved),
		changed: page.hasUnpublishedChanges || unsaved,
	};
};

export function PageStateBadge({
	autosave,
	publishing: { page, organizationSlug },
}: {
	autosave: Autosave;
	publishing: Publishing;
}) {
	const { state } = usePageState(autosave, page);
	const label = EDITOR_PAGE_STATE_LABELS[state];
	if (state !== "not-live")
		return <Badge variant={STATE_BADGES[state]}>{label}</Badge>;
	return (
		<Badge
			variant={STATE_BADGES[state]}
			title="Over your plan's page limit. See why on the page's details."
			render={
				<Link
					to="/dashboard/$organizationSlug/pages/$id"
					params={{ organizationSlug, id: page.id }}
					hash="publishing"
				/>
			}
		>
			{label}
		</Badge>
	);
}

export function PublishActions({
	autosave,
	publishing: { page, publish, discard },
}: {
	autosave: Autosave;
	publishing: Publishing;
}) {
	const getPuck = useGetPuck();
	const { changed } = usePageState(autosave, page);
	const [busy, setBusy] = useState<"publish" | "discard" | null>(null);
	const [confirming, setConfirming] = useState(false);
	const published = page.status === "published";

	const run = async (
		action: "publish" | "discard",
		write: (data: PageData) => Promise<void>,
	) => {
		setBusy(action);
		try {
			await write(getPuck().appState.data as PageData);
		} finally {
			setBusy(null);
			setConfirming(false);
		}
	};

	return (
		<div className="flex items-center gap-2">
			{published && changed && (
				<>
					<Button
						variant="ghost"
						size="sm"
						disabled={busy !== null}
						onClick={() => setConfirming(true)}
					>
						Discard changes
					</Button>
					<AlertDialog
						open={confirming}
						onOpenChange={(open) => busy === null && setConfirming(open)}
					>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									Discard unpublished changes?
								</AlertDialogTitle>
								<AlertDialogDescription>
									The page goes back to what's live now. Every change since you
									last published is dropped, and so is your undo history. The
									live page doesn't change.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={busy !== null}>
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									disabled={busy !== null}
									onClick={() => run("discard", discard)}
								>
									{busy === "discard" ? "Discarding…" : "Discard changes"}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</>
			)}
			{(!published || changed) && (
				<Button
					size="sm"
					disabled={busy !== null}
					onClick={() => run("publish", publish)}
				>
					{busy === "publish"
						? "Publishing…"
						: published
							? "Publish changes"
							: "Publish"}
				</Button>
			)}
		</div>
	);
}
