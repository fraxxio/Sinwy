import { type ComponentData, type Data, useGetPuck } from "@puckeditor/core";
import { useEffect } from "react";
import { toast } from "#/shared/components/ui/toast";
import { cloneBlock, type Placement, placementFor } from "./editor-actions";

const CLIPBOARD_KEY = "sinwy:page-builder:clipboard";

const notify = (title: string, type: "success" | "error" = "success") =>
	toast.add({ type, title, timeout: type === "error" ? 5_000 : 2_000 });

const typesIn = (value: unknown, found = new Set<string>()): Set<string> => {
	if (Array.isArray(value)) for (const item of value) typesIn(item, found);
	else if (value && typeof value === "object" && "type" in value) {
		found.add(String(value.type));
		for (const prop of Object.values((value as ComponentData).props ?? {}))
			typesIn(prop, found);
	}
	return found;
};

/** The editing commands our chrome and hotkeys share. Each one checks Puck's permissions for the selected block. */
export function useBlockActions() {
	const getPuck = useGetPuck();

	const selection = () => {
		const puck = getPuck();
		const selector = puck.appState.ui.itemSelector;
		const item = puck.selectedItem;
		if (!item || !selector?.zone) return null;
		return {
			puck,
			item,
			zone: selector.zone,
			index: selector.index,
			permissions: puck.getPermissions({ item }),
		};
	};

	const select = (placement: Placement) =>
		getPuck().dispatch({
			type: "setUi",
			ui: { itemSelector: placement },
		});

	/** `insert` then `replace`: atomic actions that run `resolveData`, which `setData` skips. History debounces them into one step. */
	const place = (block: ComponentData, placement: Placement) => {
		const { dispatch } = getPuck();
		dispatch({
			type: "insert",
			componentType: block.type,
			destinationIndex: placement.index,
			destinationZone: placement.zone,
			id: block.props.id,
		});
		dispatch({
			type: "replace",
			destinationIndex: placement.index,
			destinationZone: placement.zone,
			data: block,
			ui: { itemSelector: placement },
		});
	};

	const insertBlock = (block: ComponentData) => {
		const puck = getPuck();
		const current = selection();
		const placement = placementFor(
			puck.config,
			puck.appState.data as Data,
			block.type,
			{
				item: current?.item ?? null,
				zone: current?.zone,
				index: current?.index,
				parentType: current
					? puck.getParentById(current.item.props.id)?.type
					: undefined,
			},
		);
		place(block, placement);
	};

	/** Types the drawer offers; a pasted block holding any other type (a plan-locked one) is refused. */
	const insertableTypes = () => {
		const { config } = getPuck();
		const categories = Object.values(config.categories ?? {});
		return new Set(
			categories.length
				? categories
						.filter((category) => category.visible !== false)
						.flatMap((category) => category.components ?? [])
				: Object.keys(config.components),
		);
	};

	return {
		add: (type: string) => {
			const defaults = getPuck().config.components[type]?.defaultProps ?? {};
			insertBlock(cloneBlock({ type, props: structuredClone(defaults) }));
		},
		duplicate: () => {
			const current = selection();
			if (!current?.permissions.duplicate) return false;
			place(cloneBlock(current.item), {
				zone: current.zone,
				index: current.index + 1,
			});
			return true;
		},
		copy: () => {
			const current = selection();
			if (!current) return false;
			localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(current.item));
			notify(
				`Copied ${current.puck.config.components[current.item.type]?.label ?? "block"}`,
			);
			return true;
		},
		paste: () => {
			let block: unknown;
			try {
				block = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) ?? "null");
			} catch {
				block = null;
			}
			if (!block || typeof block !== "object" || !("type" in block))
				return false;
			const allowed = insertableTypes();
			const refused = [...typesIn(block)].filter((type) => !allowed.has(type));
			if (refused.length) {
				const { config } = getPuck();
				notify(
					`Can't paste: ${refused.map((type) => config.components[type]?.label ?? type).join(", ")} isn't available on your plan.`,
					"error",
				);
				return true;
			}
			insertBlock(cloneBlock(block as ComponentData));
			return true;
		},
		move: (step: -1 | 1) => {
			const current = selection();
			if (!current?.permissions.drag) return false;
			const target = current.index + step;
			if (
				target < 0 ||
				!current.puck.getItemBySelector({ zone: current.zone, index: target })
			)
				return true;
			current.puck.dispatch({
				type: "reorder",
				sourceIndex: current.index,
				destinationIndex: target,
				destinationZone: current.zone,
			});
			select({ zone: current.zone, index: target });
			return true;
		},
		remove: () => {
			const current = selection();
			if (!current?.permissions.delete) return false;
			current.puck.dispatch({
				type: "remove",
				index: current.index,
				zone: current.zone,
			});
			return true;
		},
		selectParent: () => {
			const current = selection();
			if (!current) return false;
			const parent = current.puck.getParentById(current.item.props.id);
			const selector = parent && current.puck.getSelectorForId(parent.props.id);
			if (selector) select(selector);
			return !!selector;
		},
		deselect: () =>
			getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } }),
	};
}

const isTyping = (target: EventTarget | null) => {
	if (!(target instanceof Element)) return false;
	return !!target.closest(
		'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="listbox"], [role="dialog"]',
	);
};

const hasTextSelection = (doc: Document) => !!doc.getSelection()?.toString();

/**
 * Copy, paste, duplicate and move with the keyboard, on the host page and inside the canvas iframe. Puck itself
 * only has undo, redo and delete.
 */
export function useEditorHotkeys() {
	const actions = useBlockActions();

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || isTyping(event.target)) return;
			const doc =
				event.target instanceof Node
					? (event.target.ownerDocument ?? document)
					: document;
			const mod = event.metaKey || event.ctrlKey;
			const key = event.key.toLowerCase();
			let handled = false;
			if (mod && key === "c" && !hasTextSelection(doc))
				handled = actions.copy();
			else if (mod && key === "v") handled = actions.paste();
			else if (mod && key === "d") handled = actions.duplicate() || true;
			else if (event.altKey && key === "arrowup") handled = actions.move(-1);
			else if (event.altKey && key === "arrowdown") handled = actions.move(1);
			else if (key === "escape") {
				actions.deselect();
				handled = false;
			}
			if (handled) event.preventDefault();
		};

		const attached = new Set<Document>();
		const attach = (doc: Document | null | undefined) => {
			if (!doc || attached.has(doc)) return;
			doc.addEventListener("keydown", onKeyDown);
			attached.add(doc);
		};
		attach(document);
		const frame = () =>
			document.querySelector<HTMLIFrameElement>("iframe#preview-frame");
		const poll = window.setInterval(() => {
			const doc = frame()?.contentDocument;
			if (doc?.readyState === "complete" && doc.body) attach(doc);
		}, 500);

		return () => {
			window.clearInterval(poll);
			for (const doc of attached) doc.removeEventListener("keydown", onKeyDown);
		};
	}, [actions]);
}
