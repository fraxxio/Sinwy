import { type ComponentData, useGetPuck } from "@puckeditor/core";
import type { BlockNode } from "@sinwy/shared";
import { useMemo } from "react";
import {
	cloneBlock,
	moveTarget,
	newBlockId,
	placementFor,
	ROOT_ZONE,
	type Selector,
	WRAPPER,
} from "./block-actions";

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
 * The block toolbar's and action bar's commands on the selected block. Each one is a single history entry: Puck
 * records history 250 ms after the last recorded dispatch and never records `setUi`.
 */
export function useBlockActions() {
	const getPuck = useGetPuck();

	return useMemo(() => {
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
					selector?.zone
						? { zone: selector.zone, index: selector.index }
						: null,
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
				const { puck, item } = selected() ?? {};
				const parent = item && puck?.getParentById(item.props.id);
				const selector = parent && puck?.getSelectorForId(parent.props.id);
				if (selector) select(selector);
			},
		};
	}, [getPuck]);
}
