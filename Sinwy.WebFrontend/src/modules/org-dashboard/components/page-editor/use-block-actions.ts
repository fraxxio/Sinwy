import { type ComponentData, type PuckApi, useGetPuck } from "@puckeditor/core";
import type { BlockNode } from "@sinwy/shared";
import { useEffect, useEffectEvent, useMemo } from "react";
import { toast } from "#/shared/components/ui/toast";
import {
	cloneBlock,
	moveTarget,
	newBlockId,
	parentSelector,
	placementFor,
	ROOT_ZONE,
	refusedDropNotice,
	type Selector,
	stepInReadingOrder,
	WRAPPER,
} from "./block-actions";
import { useCanvasDocument } from "./EditorCanvas";

/** Scrolls the canvas to a block once Puck has rendered it, unless it's already in view. */
function scrollToBlock(id: string, timeoutMs = 3_000) {
	const frame = document.querySelector<HTMLIFrameElement>(
		"iframe#preview-frame",
	);
	const doc = frame?.contentDocument;
	const view = frame?.contentWindow;
	if (!doc?.body || !view) return;
	const selector = `[data-puck-component="${CSS.escape(id)}"]`;
	const reveal = (element: Element) => {
		const { top, bottom, height } = element.getBoundingClientRect();
		if (top >= 0 && bottom <= view.innerHeight) return;
		const margin = Math.max(24, (view.innerHeight - height) / 2);
		view.scrollTo({ top: view.scrollY + top - margin, behavior: "smooth" });
	};
	const found = doc.querySelector(selector);
	if (found) return reveal(found);
	const observer = new MutationObserver(() => {
		const element = doc.querySelector(selector);
		if (!element) return;
		stop();
		reveal(element);
	});
	const timer = setTimeout(() => stop(), timeoutMs);
	const stop = () => {
		observer.disconnect();
		clearTimeout(timer);
	};
	observer.observe(doc.body, { childList: true, subtree: true });
}

/**
 * The commands on the selected block, from the toolbar, the action bar and the keyboard. Each edit is a single
 * history entry: Puck records history 250 ms after the last recorded dispatch and never records `setUi`.
 */
/** Puck records an edit 250 ms after it; history travel before that skips the edit and the late record drops the redo. */
const historyPending = ({ appState, history }: PuckApi) =>
	history.histories[history.index]?.state.data !== appState.data;

const SETTLE_POLL_MS = 50;
const SETTLE_TIMEOUT_MS = 500;

/** Undoes or redoes once Puck has recorded the latest edit. */
async function travelWhenRecorded(
	getPuck: () => PuckApi,
	direction: "back" | "forward",
) {
	const started = Date.now();
	while (historyPending(getPuck()) && Date.now() - started < SETTLE_TIMEOUT_MS)
		await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
	getPuck().history[direction]();
}

export function blockActions(getPuck: () => PuckApi) {
	const selected = () => {
		const puck = getPuck();
		const selector = puck.appState.ui.itemSelector;
		const item = puck.selectedItem;
		if (!item || !selector?.zone) return null;
		return {
			puck,
			item: item as BlockNode,
			at: { zone: selector.zone, index: selector.index } as Selector,
		};
	};
	const select = (itemSelector: Selector | null) =>
		getPuck().dispatch({ type: "setUi", ui: { itemSelector } });

	return {
		/** Adds a block with its defaults where `placementFor` says, selects it and scrolls to it. */
		add: (type: string) => {
			const { appState, dispatch } = getPuck();
			const selector = appState.ui.itemSelector;
			const placement = placementFor(
				appState.data.content as BlockNode[],
				type,
				selector?.zone ? { zone: selector.zone, index: selector.index } : null,
			);
			let at: Selector = placement;
			if (placement.wrap) {
				const wrapperId = newBlockId(WRAPPER.type);
				dispatch({
					type: "insert",
					componentType: WRAPPER.type,
					destinationZone: ROOT_ZONE,
					destinationIndex: placement.index,
					id: wrapperId,
				});
				at = { zone: `${wrapperId}:${WRAPPER.slot}`, index: 0 };
			}
			const id = newBlockId(type);
			dispatch({
				type: "insert",
				componentType: type,
				destinationZone: at.zone,
				destinationIndex: at.index,
				id,
			});
			select(at);
			scrollToBlock(id);
		},
		duplicate: () => {
			const current = selected();
			if (!current) return;
			const copy = cloneBlock(current.item);
			const at = { zone: current.at.zone, index: current.at.index + 1 };
			const { dispatch } = current.puck;
			// `replace` can't change an id, so the copy goes in empty under its own id and is then filled
			dispatch({
				type: "insert",
				componentType: copy.type,
				destinationZone: at.zone,
				destinationIndex: at.index,
				id: copy.props.id,
			});
			dispatch({
				type: "replace",
				destinationZone: at.zone,
				destinationIndex: at.index,
				data: copy as ComponentData,
				ui: { itemSelector: at },
			});
		},
		move: (step: -1 | 1) => {
			const current = selected();
			if (!current) return;
			const content = current.puck.appState.data.content as BlockNode[];
			const target = moveTarget(content, current.at, step);
			if (target === null) return;
			select({ zone: current.at.zone, index: target });
			current.puck.dispatch({
				type: "reorder",
				sourceIndex: current.at.index,
				destinationIndex: target,
				destinationZone: current.at.zone,
			});
		},
		remove: () => {
			const current = selected();
			if (!current) return;
			select(null);
			current.puck.dispatch({
				type: "remove",
				zone: current.at.zone,
				index: current.at.index,
			});
		},
		selectParent: () => {
			const current = selected();
			const content = current?.puck.appState.data.content as BlockNode[];
			const parent = current && parentSelector(content, current.at);
			if (parent) select(parent);
		},
		/** Selects the block before or after the selected one in reading order and scrolls to it. */
		step: (step: -1 | 1) => {
			const { appState, getItemBySelector } = getPuck();
			const selector = appState.ui.itemSelector;
			const target = stepInReadingOrder(
				appState.data.content as BlockNode[],
				selector?.zone ? { zone: selector.zone, index: selector.index } : null,
				step,
			);
			const item = target && getItemBySelector(target);
			if (!target || !item) return;
			select(target);
			scrollToBlock(item.props.id);
		},
		/** Selects a block by id and scrolls to it. */
		show: (id: string) => {
			const at = getPuck().getSelectorForId(id);
			if (!at?.zone) return;
			select({ zone: at.zone, index: at.index });
			scrollToBlock(id);
		},
		/** Selects the parent block, or deselects at the top level. */
		escape: () => {
			const current = selected();
			if (!current) return false;
			const content = current.puck.appState.data.content as BlockNode[];
			select(parentSelector(content, current.at));
			return true;
		},
		hasSelection: () => !!selected(),
		historyPending: () => historyPending(getPuck()),
		undo: () => travelWhenRecorded(getPuck, "back"),
		redo: () => travelWhenRecorded(getPuck, "forward"),
	};
}

export function useBlockActions() {
	const getPuck = useGetPuck();
	return useMemo(() => blockActions(getPuck), [getPuck]);
}

/** Calls `onKeyDown` for every keydown on the host page and inside the canvas, before Puck's own listeners. */
export function useEditorKeys(onKeyDown: (event: KeyboardEvent) => void) {
	const frame = useCanvasDocument();
	const listener = useEffectEvent(onKeyDown);
	useEffect(() => {
		const docs = frame ? [document, frame] : [document];
		const listen = (event: KeyboardEvent) => listener(event);
		for (const doc of docs) doc.addEventListener("keydown", listen, true);
		return () => {
			for (const doc of docs) doc.removeEventListener("keydown", listen, true);
		};
	}, [frame]);
}

const DRAG_DISTANCE_PX = 8;
/** Puck finishes a drop 250 ms after the pointer is released. */
const DROP_SETTLE_MS = 400;

/** Explains a drag released over a zone that doesn't take the block, which Puck keeps in its own zone without a word. */
export function useRefusedDropNotice() {
	const frame = useCanvasDocument();
	const getPuck = useGetPuck();
	useEffect(() => {
		if (!frame) return;
		let drag: { id: string; x: number; y: number; zone: string } | null = null;
		const zoneOf = (id: string) => getPuck().getSelectorForId(id)?.zone;
		const down = (event: PointerEvent) => {
			const block = (event.target as Element | null)?.closest?.(
				"[data-puck-component]",
			);
			const id = block?.getAttribute("data-puck-component");
			const zone = id && zoneOf(id);
			drag =
				id && zone ? { id, x: event.clientX, y: event.clientY, zone } : null;
		};
		const up = (event: PointerEvent) => {
			const started = drag;
			drag = null;
			if (
				!started ||
				Math.hypot(event.clientX - started.x, event.clientY - started.y) <
					DRAG_DISTANCE_PX
			)
				return;
			const target = frame
				.elementFromPoint(event.clientX, event.clientY)
				?.closest("[data-puck-dropzone]")
				?.getAttribute("data-puck-dropzone");
			if (!target || target === started.zone) return;
			setTimeout(() => {
				if (zoneOf(started.id) !== started.zone) return;
				const notice = refusedDropNotice(
					getPuck().appState.data.content as BlockNode[],
					started.id,
					target,
				);
				if (notice) toast.add({ type: "info", title: notice, timeout: 10_000 });
			}, DROP_SETTLE_MS);
		};
		frame.addEventListener("pointerdown", down, true);
		frame.addEventListener("pointerup", up, true);
		return () => {
			frame.removeEventListener("pointerdown", down, true);
			frame.removeEventListener("pointerup", up, true);
		};
	}, [frame, getPuck]);
}

const roles = (...names: string[]) =>
	names.map((name) => `[role="${name}"]`).join(", ");

/** Text entry keeps every key for itself, as Puck's own Delete treats it. */
const TEXT_ENTRY = `input, textarea, select, [contenteditable]:not([contenteditable="false"]), ${roles("textbox", "combobox", "searchbox", "listbox", "grid")}`;

/** Widgets that move their own focus with the arrow keys. */
const ARROW_WIDGETS = roles("menu", "tablist", "radiogroup", "slider", "tree");

const focusIn = (event: KeyboardEvent, selector: string) => {
	const origin = (event.composedPath()[0] ?? event.target) as Partial<Element>;
	return typeof origin?.closest === "function" && !!origin.closest(selector);
};

/** Toasts are non-modal dialogs and leave the keys to the editor. */
const modalOpen = () =>
	!!document.querySelector(
		'[role="dialog"]:not([aria-modal="false"]), [role="alertdialog"]',
	);

/** The undo and redo combos Puck listens for. */
const historyKey = (event: KeyboardEvent) => {
	if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
	if (event.code === "KeyZ") return event.shiftKey ? "redo" : "undo";
	if (event.code === "KeyY" && !event.shiftKey) return "redo";
	return null;
};

/**
 * Delete, Backspace, ↑ ↓, Alt+↑ ↓ and Esc on the selected block, on the host page and inside the canvas. Undo and
 * redo are Puck's own, except right after an edit, when they wait for it to be recorded. Delete is taken over from
 * Puck, whose `remove` leaves the next block selected.
 */
export function useEditorHotkeys() {
	const actions = useBlockActions();
	useEditorKeys((event) => {
		const travel = historyKey(event);
		if (travel && actions.historyPending()) {
			event.preventDefault();
			event.stopPropagation();
			void actions[travel]();
			return;
		}
		if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
		if (focusIn(event, TEXT_ENTRY) || modalOpen()) return;
		const arrowsTaken = focusIn(event, ARROW_WIDGETS);
		const fromCanvas = event.currentTarget !== document;
		let handled = true;
		if (event.key.startsWith("Arrow") && arrowsTaken) handled = false;
		else if (event.altKey && event.key === "ArrowUp") actions.move(-1);
		else if (event.altKey && event.key === "ArrowDown") actions.move(1);
		else if (event.altKey || event.shiftKey) handled = false;
		else if (event.key === "Delete" || event.key === "Backspace") {
			handled = actions.hasSelection();
			actions.remove();
		} else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			handled = fromCanvas || actions.hasSelection();
			if (handled) actions.step(event.key === "ArrowUp" ? -1 : 1);
		} else if (event.key === "Escape") handled = actions.escape();
		else handled = false;
		if (handled) event.preventDefault();
	});
}
