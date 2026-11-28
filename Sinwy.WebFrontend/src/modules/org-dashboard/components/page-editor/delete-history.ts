import type { AppState, Data, PuckApi } from "@puckeditor/core";

type Pending = { before: AppState; after: Data };

let pending: Pending | null = null;

/** Remembers the page before and after a delete, until `splitDeleteEntry` sees the delete recorded. */
export const noteDelete = (before: AppState, after: Data) => {
	pending = { before, after };
};

/**
 * Puck records an edit 250 ms after it, so an edit less than 250 ms before a delete shares the delete's history
 * entry and undo would take back both. Once the delete is recorded, this gives the page before it its own entry.
 */
export function splitDeleteEntry({
	appState,
	history,
}: Pick<PuckApi, "appState" | "history">) {
	if (!pending) return;
	const { histories, index, setHistories } = history;
	const entry = histories[index];
	if (entry?.state.data !== pending.after) {
		if (appState.data !== pending.after) pending = null;
		return;
	}
	const { before } = pending;
	pending = null;
	if (
		index < 1 ||
		index !== histories.length - 1 ||
		histories[index - 1]?.state.data === before.data
	)
		return;
	setHistories([
		...histories.slice(0, index),
		{ id: `${entry.id}-before`, state: before },
		// the recorded page with today's UI, so setting it changes neither the page nor the selection
		{ ...entry, state: { ...entry.state, ui: appState.ui } },
	]);
}
