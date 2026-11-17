import { expect, it } from "bun:test";
import type { ComponentData, Config, Data } from "@puckeditor/core";
import { PLAN_FEATURES, pageContentSchema } from "@sinwy/shared";
import {
	cloneBlock,
	placementFor,
	ROOT_ZONE,
} from "../components/page-builder/editor-actions";
import { editorConfigFor } from "../components/page-builder/editor-config";
import {
	PAGE_TEMPLATES,
	templateData,
} from "../components/page-builder/templates";

const config = editorConfigFor(PLAN_FEATURES.professional) as unknown as Config;

const grid: ComponentData = {
	type: "FreeGrid",
	props: {
		id: "FreeGrid-1",
		items: [
			{ type: "Heading", props: { id: "Heading-1", text: "Hi", size: "2" } },
		],
		layout: { desktop: { "Heading-1": { x: 2, y: 0, w: 4, h: 2 } } },
	},
};

it("gives a cloned block and its children new ids and keeps FreeGrid cells on them", () => {
	const copy = cloneBlock(grid);
	const child = (copy.props["items"] as ComponentData[])[0];
	expect(copy.props.id).not.toBe("FreeGrid-1");
	expect(child?.props.id).toStartWith("Heading-");
	expect(child?.props.id).not.toBe("Heading-1");
	expect(copy.props["layout"]).toEqual({
		desktop: { [child?.props.id as string]: { x: 2, y: 0, w: 4, h: 2 } },
	});
});

it("adds into the selected block's slot, after a selected leaf, or at the end of the page", () => {
	const data: Data = { root: { props: {} }, content: [grid, grid] };
	const none = {
		item: null,
		zone: undefined,
		index: undefined,
		parentType: undefined,
	};
	expect(placementFor(config, data, "Heading", none)).toEqual({
		zone: ROOT_ZONE,
		index: 2,
	});
	expect(
		placementFor(config, data, "Heading", {
			item: grid,
			zone: ROOT_ZONE,
			index: 0,
			parentType: undefined,
		}),
	).toEqual({ zone: "FreeGrid-1:items", index: 1 });
	const heading = (grid.props["items"] as ComponentData[])[0] ?? null;
	expect(
		placementFor(config, data, "Button", {
			item: heading,
			zone: "FreeGrid-1:items",
			index: 0,
			parentType: "FreeGrid",
		}),
	).toEqual({ zone: "FreeGrid-1:items", index: 1 });
});

it("doesn't add into a locked section's slot", () => {
	const services: ComponentData = {
		type: "ServicesSection",
		props: { id: "ServicesSection-1", items: [] },
	};
	const data: Data = { root: { props: {} }, content: [services] };
	expect(
		placementFor(config, data, "Heading", {
			item: services,
			zone: ROOT_ZONE,
			index: 0,
			parentType: undefined,
		}),
	).toEqual({ zone: ROOT_ZONE, index: 1 });
});

it("builds every template into a document the server accepts, without plan-locked blocks on starter", () => {
	const starter = editorConfigFor(PLAN_FEATURES.starter) as unknown as Config;
	for (const template of PAGE_TEMPLATES) {
		const data = { root: { props: {} }, ...templateData(starter, template) };
		expect(JSON.stringify(data)).not.toContain("BookingWidget");
		expect(
			pageContentSchema.safeParse({ schemaVersion: 2, data }).error,
		).toBeUndefined();
	}
});
