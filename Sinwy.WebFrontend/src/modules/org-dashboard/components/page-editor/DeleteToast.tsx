import { type Data, type OnAction, useGetPuck } from "@puckeditor/core";
import type { BlockNode } from "@sinwy/shared";
import { type RefObject, useEffect, useEffectEvent, useRef } from "react";
import { toast } from "#/shared/components/ui/toast";
import { deletedNotice, zoneContent } from "./block-actions";
import { noteDelete, splitDeleteEntry } from "./delete-history";
import { usePuck } from "./editor-config";
import { useBlockActions } from "./use-block-actions";

type Deleted = {
	block: BlockNode;
	content: readonly BlockNode[];
	/** The page straight after the delete. */
	after: Data;
};

const listeners = new Set<(deleted: Deleted) => void>();

/** Puck's `onAction`, which sees every delete: the editor's own and the Layers row's. */
export const reportDelete: OnAction = (action, appState, prevAppState) => {
	if (action.type !== "remove") return;
	const content = prevAppState.data.content as BlockNode[];
	const block = zoneContent(content, action.zone)?.[action.index];
	if (!block) return;
	noteDelete(prevAppState, appState.data);
	for (const listener of listeners)
		listener({ block, content, after: appState.data });
};

const TOAST_MS = 10_000;

type Shown = { id: string; after: Data };

const closeShown = (shown: RefObject<Shown | null>) => {
	if (shown.current) toast.close(shown.current.id);
	shown.current = null;
};

/**
 * A "Deleted …" toast with Undo after every delete. It closes on the next change to the page, so its Undo only
 * ever takes back the delete.
 */
export function DeleteToast() {
	const getPuck = useGetPuck();
	const actions = useBlockActions();
	const data = usePuck((s) => s.appState.data);
	const historyIndex = usePuck((s) => s.history.index);
	const shown = useRef<Shown | null>(null);

	const onDelete = useEffectEvent(({ block, content, after }: Deleted) => {
		closeShown(shown);
		const id = toast.add({
			...deletedNotice(content, block),
			timeout: TOAST_MS,
			actionProps: {
				children: "Undo",
				onClick: () => {
					closeShown(shown);
					void actions.undo();
				},
			},
		});
		shown.current = { id, after };
		// Puck's own remove leaves the next block selected; this runs outside its dispatch
		queueMicrotask(() => {
			const { appState, dispatch } = getPuck();
			if (appState.ui.itemSelector)
				dispatch({ type: "setUi", ui: { itemSelector: null } });
		});
	});

	useEffect(() => {
		const listener = (deleted: Deleted) => onDelete(deleted);
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
			closeShown(shown);
		};
	}, []);

	useEffect(() => {
		if (shown.current && data !== shown.current.after) closeShown(shown);
	}, [data]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when Puck records history
	useEffect(() => {
		splitDeleteEntry(getPuck());
	}, [historyIndex, getPuck]);

	return null;
}
