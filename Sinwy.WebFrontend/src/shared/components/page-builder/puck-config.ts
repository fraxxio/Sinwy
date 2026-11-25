import type {
	Config,
	Field,
	CustomField as PuckCustomField,
	RichtextField,
} from "@puckeditor/core";
import type { BlockField, Blocks } from "@sinwy/shared";
import type { ReactNode } from "react";

/** The editor UI of a field kind, custom or built in; the label and locked flag come from the manifest. */
export type CustomFieldUi = Omit<
	PuckCustomField<unknown>,
	"label" | "metadata"
>;

export type CustomFields = Partial<Record<string, CustomFieldUi>>;

// biome-ignore lint/suspicious/noExplicitAny: each block's render takes its own props
export type BlockRenders = Record<string, (props: any) => ReactNode>;

/** Only what the rich text allowlist keeps, so the editor offers nothing the server would drop. */
const RICH_TEXT_OPTIONS: RichtextField["options"] = {
	heading: { levels: [2, 3] },
	code: false,
	codeBlock: false,
	horizontalRule: false,
	textAlign: false,
};

const puckField = (
	field: BlockField,
	customFields: CustomFields,
): Field | null => {
	const meta = {
		...(field.label && { label: field.label }),
		...(field.locked && { metadata: { locked: true } }),
	};
	const ui = customFields[field.kind];
	if (ui) return { ...ui, ...meta };
	if ("custom" in field) return null;
	switch (field.kind) {
		case "text":
		case "link":
		case "image":
			return { ...meta, type: "text" };
		case "select":
			return {
				...meta,
				type: field.display,
				options: field.options.map(({ value, label }) => ({ label, value })),
			};
		case "richText":
			return { ...meta, type: "richtext", options: RICH_TEXT_OPTIONS };
		case "slot":
			return { ...meta, type: "slot", allow: [...field.allow] };
	}
};

/** A Puck config from the block manifest. Fields of custom kinds without UI are left out; their props still render. */
export function puckConfigFrom(
	blocks: Blocks,
	renders: BlockRenders,
	{
		customFields = {},
		root,
	}: { customFields?: CustomFields; root?: Config["root"] } = {},
): Config {
	const components = Object.fromEntries(
		Object.entries(blocks).flatMap(([type, definition]) => {
			const render = renders[type];
			if (!render) return [];
			const fields = Object.fromEntries(
				Object.entries(definition.fields).flatMap(([name, field]) => {
					const puck = puckField(field, customFields);
					return puck ? [[name, puck]] : [];
				}),
			);
			return [
				[
					type,
					{
						label: definition.label,
						fields,
						defaultProps: definition.defaults,
						render,
					},
				],
			];
		}),
	);
	return { components, ...(root && { root }) } as Config;
}
