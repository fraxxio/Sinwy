import { type ComponentData, type PuckApi, useGetPuck } from "@puckeditor/core";
import type { BlockNode } from "@sinwy/shared";
import { useEffect, useEffectEvent, useMemo } from "react";
import {
	cloneBlock,
	moveTarget,
	newBlockId,
	parentSelector,
	placementFor,
	ROOT_ZONE,
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
		/** Selects the parent block, or deselects at the top level. */
		escape: () => {
			const current = selected();
			if (!current) return false;
			const content = current.puck.appState.data.content as BlockNode[];
			select(parentSelector(content, current.at));
			return true;
		},
		hasSelection: () => !!selected(),
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

const modalOpen = () =>
	!!document.querySelector('[role="dialog"], [role="alertdialog"]');

/**
 * Delete, Backspace, ↑ ↓, Alt+↑ ↓ and Esc on the selected block, on the host page and inside the canvas. Undo and
 * redo are Puck's own. Delete is taken over from Puck, whose `remove` leaves the next block selected.
 */
export function useEditorHotkeys() {
	const actions = useBlockActions();
	useEditorKeys((event) => {
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
