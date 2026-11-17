import { expect, it } from "bun:test";
import type { Field } from "@puckeditor/core";
import {
	BLOCKS,
	type BlockType,
	PLAN_FEATURES,
	ROOT_PROPS,
} from "@sinwy/shared";
import type { z } from "zod";
import {
	editorConfig,
	editorConfigFor,
} from "../components/page-builder/editor-config";
import { renderConfig } from "../components/page-builder/render-config";
import { responsiveOptions } from "../components/page-builder/responsive";

const fieldsOf = (type: string) =>
	(
		renderConfig.components[type as BlockType] as {
			fields: Record<string, Field>;
		}
	).fields;

/** Every value a field can write, as the server will see it. */
const writable = (field: Field): unknown[] => {
	const responsive = responsiveOptions(field);
	if (responsive)
		return responsive.options.flatMap(({ value }) => [
			value,
			{ base: value, tablet: value, mobile: value },
		]);
	if (field.type === "select" || field.type === "radio")
		return field.options.map(({ value }) => value);
	return [];
};

const accepts = (schema: z.ZodObject, name: string, value: unknown) =>
	schema.safeParse({ [name]: value }).success;

it("offers the same blocks the server accepts", () => {
	expect(Object.keys(renderConfig.components).sort()).toEqual(
		Object.keys(BLOCKS).sort(),
	);
});

it("gives each block the props and slots the server accepts, and only values it accepts", () => {
	for (const [type, spec] of Object.entries(BLOCKS)) {
		const fields = fieldsOf(type);
		const slots = Object.keys(fields).filter(
			(name) => fields[name]?.type === "slot",
		);
		expect({ type, slots }).toEqual({ type, slots: [...spec.slots] });
		expect({
			type,
			props: Object.keys(fields)
				.filter((name) => !slots.includes(name) && name !== "visibility")
				.sort(),
		}).toEqual({ type, props: Object.keys(spec.props.shape).sort() });
		for (const [name, field] of Object.entries(fields))
			for (const value of writable(field))
				if (name !== "visibility" && !slots.includes(name))
					expect({
						type,
						name,
						value,
						ok: accepts(spec.props, name, value),
					}).toEqual({ type, name, value, ok: true });
	}
});

it("offers root token values the server accepts", () => {
	const fields = renderConfig.root?.fields as Record<string, Field>;
	expect(Object.keys(fields).sort()).toEqual(
		Object.keys(ROOT_PROPS.shape).sort(),
	);
	for (const [name, field] of Object.entries(fields))
		for (const value of writable(field))
			expect(accepts(ROOT_PROPS, name, value)).toBe(true);
});

it("keeps a starter plan's gated blocks out of the drawer and the ready-made sections, but able to render", () => {
	const starter = editorConfigFor(PLAN_FEATURES.starter);
	const offered = Object.values(starter.categories ?? {})
		.filter((category) => category.visible !== false)
		.flatMap((category) => category.components ?? []);
	expect(offered).not.toContain("BookingWidget");
	expect(offered).toContain("ServicesSection");
	expect(starter.categories?.other?.visible).toBe(false);
	expect(starter.components.BookingWidget).toBeDefined();
	const items = starter.components.ServicesSection.defaultProps?.items as
		| { type: string }[]
		| undefined;
	expect(items?.map((item) => item.type)).toEqual(["Heading", "RichText"]);

	expect(editorConfigFor(PLAN_FEATURES.professional)).toBe(editorConfig);
});
