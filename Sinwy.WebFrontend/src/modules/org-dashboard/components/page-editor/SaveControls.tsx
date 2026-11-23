import { useGetPuck } from "@puckeditor/core";
import { useBlocker } from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
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
import { toast } from "#/shared/components/ui/toast";
import { cn } from "#/shared/lib/utils";
import type { Autosave, AutosaveState } from "./autosave";
import { usePuck } from "./editor-config";
import { unsavedReason } from "./publishing";
import type { PageData } from "./save";
import { useEditorKeys } from "./use-block-actions";

/** What the editor does when the page was saved somewhere else. */
export type ConflictActions = {
	/** Saves this document over the newer one. */
	keepMine: () => Promise<void>;
	/** Drops the edits made here and opens the newer document. */
	loadLatest: () => Promise<void>;
};

export const useAutosaveState = (autosave: Autosave) =>
	useSyncExternalStore(
		autosave.subscribe,
		autosave.getState,
		autosave.getState,
	);

const STATUS_TEXT = {
	saved: "Saved",
	pending: "Saving…",
	saving: "Saving…",
	failed: "Not saved, retrying",
	conflict: "Not saved",
} as const;

/** Tells the owner about a save that went wrong once, not on every retry or every refused burst of edits. */
function useSaveErrorToast(state: AutosaveState) {
	const shown = useRef<string | null>(null);
	useEffect(() => {
		if (state.status === "saved") shown.current = null;
		const first =
			(state.status === "failed" && state.attempt === 1) ||
			state.status === "blocked";
		if (!first || shown.current === state.message) return;
		shown.current = state.message;
		toast.add({
			type: "error",
			title: "Not saved",
			description: state.message,
			timeout: 10_000,
		});
	}, [state]);
}

export function SaveStatus({ autosave }: { autosave: Autosave }) {
	const getPuck = useGetPuck();
	const data = usePuck((s) => s.appState.data) as PageData;
	const state = useAutosaveState(autosave);
	useSaveErrorToast(state);

	const opening = useRef(true);
	useEffect(() => {
		if (opening.current) autosave.opened(data);
		else autosave.change(data);
		opening.current = false;
	}, [autosave, data]);

	useEditorKeys((event) => {
		const mod = event.ctrlKey || event.metaKey;
		if (!mod || event.altKey || event.shiftKey || event.code !== "KeyS") return;
		event.preventDefault();
		autosave.change(getPuck().appState.data as PageData);
		void autosave.flush();
	});

	const problem = state.status === "blocked" || state.status === "conflict";
	return (
		<div className="flex items-center gap-2">
			<span
				className={cn(
					"line-clamp-2 min-w-32 max-w-64 text-right text-xs",
					problem ? "text-destructive" : "text-muted-foreground",
				)}
				title={state.status === "blocked" ? state.message : undefined}
				role="status"
			>
				{state.status === "blocked" ? state.message : STATUS_TEXT[state.status]}
			</span>
			{state.status === "failed" && (
				<Button variant="outline" size="sm" onClick={autosave.retryNow}>
					Retry now
				</Button>
			)}
		</div>
	);
}

export function ConflictBanner({
	autosave,
	actions,
}: {
	autosave: Autosave;
	actions: ConflictActions;
}) {
	const state = useAutosaveState(autosave);
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	if (state.status !== "conflict") return null;

	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			role="alert"
			className="flex shrink-0 items-center gap-3 border-b bg-destructive/10 px-4 py-2 text-sm"
		>
			<p className="min-w-0 flex-1">{state.message}</p>
			<Button
				variant="outline"
				size="sm"
				disabled={busy}
				onClick={() => setConfirming(true)}
			>
				Load latest
			</Button>
			<Button size="sm" disabled={busy} onClick={() => run(actions.keepMine)}>
				Keep mine
			</Button>
			<AlertDialog
				open={confirming}
				onOpenChange={(open) => !busy && setConfirming(open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Load the latest version?</AlertDialogTitle>
						<AlertDialogDescription>
							The editor opens the version saved elsewhere. The changes you made
							here since your last save are lost, and so is your undo history.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={busy}
							onClick={() => run(actions.loadLatest)}
						>
							{busy ? "Loading…" : "Load latest"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

/** Leaving in the app saves first and asks only when that fails; closing or reloading the tab asks while anything is unsaved. */
export function LeaveGuard({ autosave }: { autosave: Autosave }) {
	const getPuck = useGetPuck();
	const state = useAutosaveState(autosave);
	const shouldBlockFn = useCallback(async () => {
		autosave.change(getPuck().appState.data as PageData);
		const final = await autosave.flush();
		return final.status !== "saved";
	}, [autosave, getPuck]);
	const enableBeforeUnload = useCallback(
		() => autosave.getState().status !== "saved",
		[autosave],
	);
	const blocker = useBlocker({
		shouldBlockFn,
		enableBeforeUnload,
		withResolver: true,
	});

	return (
		<AlertDialog
			open={blocker.status === "blocked"}
			onOpenChange={(open) => !open && blocker.reset?.()}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Leave without saving?</AlertDialogTitle>
					<AlertDialogDescription>
						{unsavedReason(state)} If you leave now, they're lost.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						onClick={() => blocker.proceed?.()}
					>
						Leave without saving
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
