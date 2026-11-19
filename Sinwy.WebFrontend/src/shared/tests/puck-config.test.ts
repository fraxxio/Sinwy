import { describe, expect, test } from "bun:test";
import { BLOCKS, defineBlock, field, isSlotField } from "@sinwy/shared";
import { createElement } from "react";
import { BLOCK_RENDERS } from "../components/page-builder/blocks";
import {
	type CustomFieldUi,
	puckConfigFrom,
} from "../components/page-builder/puck-config";

const SERVICE_PICKER: CustomFieldUi = {
	type: "custom",
	render: () => createElement("div"),
};

describe("puckConfigFrom", () => {
	const editor = puckConfigFrom(BLOCKS, BLOCK_RENDERS, {
		customFields: { serviceIds: SERVICE_PICKER },
	});

	test("every block and every prop of the manifest has a Puck field", () => {
		expect(Object.keys(editor.components)).toEqual(Object.keys(BLOCKS));
		for (const [type, definition] of Object.entries(BLOCKS)) {
			const component = editor.components[type];
			expect(component?.label).toBe(definition.label);
			expect(Object.keys(component?.fields ?? {})).toEqual(
				Object.keys(definition.fields),
			);
		}
	});

	test("every slot keeps its allow list", () => {
		for (const [type, definition] of Object.entries(BLOCKS))
			for (const [name, f] of Object.entries(definition.fields))
				if (isSlotField(f))
					expect(editor.components[type]?.fields?.[name]).toMatchObject({
						type: "slot",
						allow: [...f.allow],
					});
	});

	test("defaults equal the manifest's", () => {
		for (const [type, definition] of Object.entries(BLOCKS))
			expect(editor.components[type]?.defaultProps).toEqual(
				definition.defaults,
			);
	});

	test("field kinds map to Puck field types", () => {
		const { fields } = editor.components["Button"] ?? {};
		expect(fields?.["label"]).toEqual({ label: "Label", type: "text" });
		expect(fields?.["href"]).toEqual({ label: "Link", type: "text" });
		expect(fields?.["variant"]).toEqual({
			label: "Style",
			type: "radio",
			options: [
				{ label: "Filled", value: "primary" },
				{ label: "Outline", value: "outline" },
			],
		});
		expect(editor.components["Heading"]?.fields?.["size"]).toMatchObject({
			type: "select",
		});
		expect(editor.components["RichText"]?.fields?.["content"]).toMatchObject({
			type: "richtext",
		});
		expect(editor.components["Services"]?.fields?.["serviceIds"]).toEqual({
			...SERVICE_PICKER,
			label: "Services",
		});
	});

	test("the storefront config leaves out custom fields without UI", () => {
		const storefront = puckConfigFrom(BLOCKS, BLOCK_RENDERS);
		const { fields } = storefront.components["Services"] ?? {};

		expect(Object.keys(fields ?? {})).toEqual(["title", "intro"]);
	});

	test("locked fields carry their flag as metadata", () => {
		const blocks = {
			Banner: defineBlock({
				label: "Banner",
				fields: {
					text: field.text({ label: "Text", locked: true }),
					note: field.text({ label: "Note" }),
				},
			}),
		};
		const { fields } =
			puckConfigFrom(blocks, { Banner: () => null }).components["Banner"] ?? {};

		expect(fields?.["text"]).toEqual({
			label: "Text",
			type: "text",
			metadata: { locked: true },
		});
		expect(fields?.["note"]).toEqual({ label: "Note", type: "text" });
	});
});
