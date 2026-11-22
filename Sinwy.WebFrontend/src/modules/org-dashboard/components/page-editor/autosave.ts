import { API_ERROR_CODES } from "@sinwy/shared";
import { hasUnsavedChanges, type PageData } from "./save";

export const AUTOSAVE_DEBOUNCE_MS = 1000;
export const AUTOSAVE_MAX_WAIT_MS = 10_000;
export const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000] as const;
const LAST_RETRY_DELAY_MS = 30_000;

export type SaveOutcome =
	| { ok: true; base: number }
	| { ok: false; code: number; message: string };

export type SaveFn = (data: PageData, base: number) => Promise<SaveOutcome>;

export type AutosaveState =
	| { status: "saved" }
	| { status: "pending" }
	| { status: "saving" }
	| { status: "failed"; message: string; attempt: number; retryAt: number }
	| { status: "blocked"; message: string }
	| { status: "conflict"; message: string };

export type Clock = {
	now: () => number;
	setTimeout: (run: () => void, ms: number) => unknown;
	clearTimeout: (timer: unknown) => void;
};

const systemClock: Clock = {
	now: () => Date.now(),
	setTimeout: (run, ms) => setTimeout(run, ms),
	clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

const SAVED: AutosaveState = { status: "saved" };
const PENDING: AutosaveState = { status: "pending" };
const SAVING: AutosaveState = { status: "saving" };

/** App codes extend the HTTP status with extra digits (4021 is a 402). */
const httpStatus = (code: number) => {
	let status = code;
	while (status >= 1000) status = Math.floor(status / 10);
	return status;
};

const failureKind = (code: number) => {
	if (code === API_ERROR_CODES.PAGE_VERSION_CONFLICT) return "conflict";
	const status = httpStatus(code);
	const transient =
		code === 0 || status >= 500 || status === 408 || status === 429;
	return transient ? "failed" : "blocked";
};

const retryDelay = (attempt: number) =>
	RETRY_DELAYS_MS[attempt - 1] ?? LAST_RETRY_DELAY_MS;

/** Saves the document on its own, one request at a time, and tracks whether it is saved. */
export function createAutosave({
	data,
	base,
	save,
	clock = systemClock,
}: {
	data: PageData;
	base: number;
	save: SaveFn;
	clock?: Clock;
}) {
	let saved = data;
	let current = data;
	let currentBase = base;
	let refused: PageData | null = null;
	let state = SAVED;
	let inFlight: Promise<void> | null = null;
	let generation = 0;
	let attempt = 0;
	let changeSeq = 0;
	let savedSeq = 0;
	let debounceTimer: unknown;
	let maxWaitTimer: unknown;
	let retryTimer: unknown;
	let disposed = false;
	const listeners = new Set<() => void>();

	const setState = (next: AutosaveState) => {
		if (next === state) return;
		state = next;
		for (const listener of listeners) listener();
	};

	const dirty = () => hasUnsavedChanges(current, saved);

	const clearSchedule = () => {
		if (debounceTimer !== undefined) clock.clearTimeout(debounceTimer);
		if (maxWaitTimer !== undefined) clock.clearTimeout(maxWaitTimer);
		debounceTimer = maxWaitTimer = undefined;
	};

	const clearRetry = () => {
		if (retryTimer !== undefined) clock.clearTimeout(retryTimer);
		retryTimer = undefined;
	};

	const onDue = () => {
		clearSchedule();
		if (inFlight) return;
		if (dirty()) startSave();
		else setState(SAVED);
	};

	const schedule = () => {
		if (debounceTimer !== undefined) clock.clearTimeout(debounceTimer);
		debounceTimer = clock.setTimeout(onDue, AUTOSAVE_DEBOUNCE_MS);
		maxWaitTimer ??= clock.setTimeout(onDue, AUTOSAVE_MAX_WAIT_MS);
	};

	/** After a save, changes made during it either wait for their timer or go now if it already fired. */
	const continueWith = (idle: AutosaveState) => {
		if (debounceTimer === undefined) startSave();
		else setState(idle);
	};

	const settle = (outcome: SaveOutcome, sent: PageData, sentSeq: number) => {
		if (outcome.ok) {
			saved = sent;
			savedSeq = sentSeq;
			currentBase = outcome.base;
			attempt = 0;
			refused = null;
			if (dirty()) return continueWith(PENDING);
			clearSchedule();
			return setState(SAVED);
		}
		const kind = failureKind(outcome.code);
		if (kind === "conflict") {
			clearSchedule();
			return setState({ status: "conflict", message: outcome.message });
		}
		if (kind === "blocked") {
			refused = sent;
			if (hasUnsavedChanges(current, sent) && dirty())
				return continueWith(PENDING);
			clearSchedule();
			return setState(
				dirty() ? { status: "blocked", message: outcome.message } : SAVED,
			);
		}
		clearSchedule();
		attempt += 1;
		const delay = retryDelay(attempt);
		retryTimer = clock.setTimeout(retryNow, delay);
		setState({
			status: "failed",
			message: outcome.message,
			attempt,
			retryAt: clock.now() + delay,
		});
	};

	function startSave() {
		clearSchedule();
		clearRetry();
		const sent = current;
		const sentSeq = changeSeq;
		const run = generation;
		setState(SAVING);
		inFlight = (async () => {
			let outcome: SaveOutcome;
			try {
				outcome = await save(sent, currentBase);
			} catch {
				outcome = { ok: false, code: 0, message: "Couldn't save." };
			}
			if (run !== generation) return;
			inFlight = null;
			settle(outcome, sent, sentSeq);
		})();
	}

	function retryNow() {
		if (disposed || state.status !== "failed") return;
		clearRetry();
		if (dirty()) startSave();
		else setState(SAVED);
	}

	const change = (data: PageData) => {
		if (disposed) return;
		current = data;
		changeSeq += 1;
		switch (state.status) {
			case "conflict":
			case "failed":
				return;
			case "saving":
				return schedule();
			case "blocked":
				if (refused && !hasUnsavedChanges(data, refused)) return;
		}
		if (!dirty()) {
			clearSchedule();
			refused = null;
			return setState(SAVED);
		}
		schedule();
		setState(PENDING);
	};

	/** Saves everything changed before the call; one attempt if a save fails. */
	const flush = async (): Promise<AutosaveState> => {
		const target = changeSeq;
		for (;;) {
			if (disposed) return state;
			if (inFlight) {
				await inFlight;
				if (state.status === "failed") return state;
				continue;
			}
			if (state.status === "conflict" || state.status === "blocked")
				return state;
			if (savedSeq >= target || !dirty()) return state;
			startSave();
		}
	};

	/** "Keep mine": saves this document over the newer one. */
	const resolveConflict = (newBase: number) => {
		if (state.status === "conflict" && !disposed) {
			currentBase = newBase;
			startSave();
		}
		return flush();
	};

	const stop = () => {
		generation += 1;
		inFlight = null;
		clearSchedule();
		clearRetry();
	};

	/** Starts over from a document the server already holds; a save still in flight is ignored. */
	const reset = (data: PageData, base: number) => {
		if (disposed) return;
		stop();
		saved = current = data;
		currentBase = base;
		refused = null;
		attempt = 0;
		savedSeq = changeSeq;
		setState(SAVED);
	};

	const dispose = () => {
		disposed = true;
		stop();
		listeners.clear();
	};

	return {
		change,
		flush,
		retryNow,
		resolveConflict,
		reset,
		dispose,
		getState: () => state,
		getBase: () => currentBase,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export type Autosave = ReturnType<typeof createAutosave>;
