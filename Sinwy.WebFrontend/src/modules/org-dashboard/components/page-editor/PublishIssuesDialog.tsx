import { type ReactNode, useRef } from "react";
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
import { Button } from "#/shared/components/ui/button";
import type { PublishIssue } from "./publish-checks";

/** Lists what looks unfilled before a publish; publishing anyway is always allowed. */
export function PublishIssuesDialog({
	issues,
	busy,
	onCancel,
	onPublish,
	onShow,
	footer,
}: {
	/** Empty closes the dialog. */
	issues: readonly PublishIssue[];
	busy: boolean;
	onCancel: () => void;
	onPublish: () => void;
	/** Offers "Show" next to each issue. */
	onShow?: (issue: PublishIssue) => void;
	/** Shown under the list, like a link to the editor. */
	footer?: ReactNode;
}) {
	const one = issues.length === 1;
	const cancel = useRef<HTMLButtonElement>(null);
	return (
		<AlertDialog
			open={issues.length > 0}
			onOpenChange={(open) => !open && !busy && onCancel()}
		>
			<AlertDialogContent initialFocus={cancel}>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{one ? "Something looks unfilled" : "Some things look unfilled"}
					</AlertDialogTitle>
					<AlertDialogDescription>
						Visitors would see {one ? "it" : "them"} as{" "}
						{one ? "it is" : "they are"}. Fill {one ? "it" : "them"} in first,
						or publish anyway.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<ul className="grid max-h-64 gap-1 overflow-y-auto text-sm">
					{issues.map((issue) => (
						<li
							key={`${issue.id}:${issue.problem}`}
							className="flex items-center justify-between gap-3"
						>
							<span>
								<span className="font-medium">{issue.block}</span>
								<span className="text-muted-foreground">
									{" "}
									· {issue.problem}
								</span>
							</span>
							{onShow && (
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => onShow(issue)}
								>
									Show
								</Button>
							)}
						</li>
					))}
				</ul>
				{footer}
				<AlertDialogFooter>
					<AlertDialogCancel ref={cancel} disabled={busy}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction disabled={busy} onClick={onPublish}>
						{busy ? "Publishing…" : "Publish anyway"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
