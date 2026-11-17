import type { ComponentData, Config, Data, Field } from "@puckeditor/core";

export const ROOT_ZONE = "root:default-zone";

type Block = { type: string; props: Record<string, unknown> };

const isBlock = (value: unknown): value is Block =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as Block).type === "string" &&
	typeof (value as Block).props === "object";

export const newId = (type: string) => `${type}-${crypto.randomUUID()}`;

/**
 * Copies a block with new ids for it and every nested block. Other props that point at an old id (FreeGrid's
 * layout keys) are rewritten too, which Puck's own duplicate doesn't do.
 */
export function cloneBlock<T extends Block>(block: T): T {
	const ids = new Map<string, string>();
	const reassign = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(reassign);
		if (!isBlock(value)) return value;
		const id = newId(value.type);
		const old = value.props["id"];
		if (typeof old === "string") ids.set(old, id);
		return {
			...value,
			props: {
				...Object.fromEntries(
					Object.entries(value.props).map(([name, prop]) => [
						name,
						reassign(prop),
					]),
				),
				id,
			},
		};
	};
	let json = JSON.stringify(reassign(block));
	for (const [from, to] of ids) json = json.replaceAll(`"${from}"`, `"${to}"`);
	return JSON.parse(json);
}

export const zoneOf = (parentId: string, slot: string) => `${parentId}:${slot}`;

/** Slot names of a block type, in field order. */
export const slotsOf = (config: Config, type: string) =>
	Object.entries(
		(config.components[type]?.fields ?? {}) as Record<string, Field>,
	).flatMap(([name, field]) => (field.type === "slot" ? [name] : []));

/** Whether a slot's `allow` / `disallow` lists let `type` in, as Puck's drag and drop decides it. */
export function slotAccepts(
	config: Config,
	parentType: string | undefined,
	slot: string,
	type: string,
) {
	if (!parentType) return true;
	const field = config.components[parentType]?.fields?.[slot] as
		| (Field & { allow?: string[]; disallow?: string[] })
		| undefined;
	if (field?.disallow?.includes(type) && !field.allow?.includes(type))
		return false;
	return field?.allow ? field.allow.includes(type) : true;
}

export type Placement = { zone: string; index: number };

/**
 * Where "add" puts a new block: into the selected block's first slot when it has one, otherwise right after the
 * selected block, otherwise at the end of the page. A slot that refuses the type is skipped.
 */
export function placementFor(
	config: Config,
	data: Data,
	type: string,
	selected: {
		item: ComponentData | null;
		zone: string | undefined;
		index: number | undefined;
		parentType: string | undefined;
	},
): Placement {
	const end = { zone: ROOT_ZONE, index: data.content.length };
	const { item, zone, index } = selected;
	if (!item || zone === undefined || index === undefined) return end;
	const slot = slotsOf(config, item.type)[0];
	if (slot && slotAccepts(config, item.type, slot, type)) {
		const children = item.props[slot];
		return {
			zone: zoneOf(item.props.id, slot),
			index: Array.isArray(children) ? children.length : 0,
		};
	}
	const [, slotName = ""] = zone.split(/:(?=[^:]*$)/);
	if (
		zone === ROOT_ZONE ||
		slotAccepts(config, selected.parentType, slotName, type)
	)
		return { zone, index: index + 1 };
	return end;
}
