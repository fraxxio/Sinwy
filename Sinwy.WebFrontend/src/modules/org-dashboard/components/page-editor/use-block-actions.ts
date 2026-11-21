import { type ComponentData, useGetPuck } from "@puckeditor/core";
import type { BlockNode } from "@sinwy/shared";
import { useMemo } from "react";
import { cloneBlock, moveTarget, type Selector } from "./block-actions";

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
