import type { ComponentData, Config, Data } from "@puckeditor/core";
import { cloneBlock } from "./editor-actions";

type Draft = { type: string; props?: Record<string, unknown> };

export type PageTemplate = {
	id: string;
	name: string;
	description: string;
	blocks: Draft[];
};

const text = (html: string): Draft => ({
	type: "RichText",
	props: { content: html },
});

export const PAGE_TEMPLATES: readonly PageTemplate[] = [
	{
		id: "salon-home",
		name: "Salon homepage",
		description:
			"A welcome banner, your services with booking, photos and how to find you.",
		blocks: [
			{ type: "Hero" },
			{ type: "ServicesSection" },
			{
				type: "Section",
				props: {
					items: [
						{ type: "Heading", props: { text: "Inside the salon", size: "2" } },
						{
							type: "Columns",
							props: {
								column1: [{ type: "Image", props: { aspect: "square" } }],
								column2: [{ type: "Image", props: { aspect: "square" } }],
							},
						},
					],
				},
			},
			{
				type: "Section",
				props: {
					tone: "muted",
					items: [
						{ type: "Heading", props: { text: "Find us", size: "2" } },
						text(
							"<p>Add your address, opening hours and how to park or get here by bus.</p>",
						),
					],
				},
			},
		],
	},
	{
		id: "simple",
		name: "Simple page",
		description: "A heading and some text, for an about or prices page.",
		blocks: [
			{
				type: "Section",
				props: {
					items: [
						{ type: "Heading", props: { text: "About us", size: "1" } },
						text(
							"<p>Tell customers who you are, how long you've been open and what makes your place different.</p>",
						),
						{ type: "Button" },
					],
				},
			},
		],
	},
];

/** Fills each block from the config's `defaultProps`, so a template follows the plan's version of the presets. */
function build(config: Config, draft: Draft): ComponentData {
	const defaults = (config.components[draft.type]?.defaultProps ??
		{}) as Record<string, unknown>;
	const props = Object.fromEntries(
		Object.entries({ ...defaults, ...draft.props }).map(([name, value]) => [
			name,
			Array.isArray(value) &&
			value.every((item) => item?.type && !item.props?.id)
				? value.map((item: Draft) => build(config, item))
				: value,
		]),
	);
	return cloneBlock({ type: draft.type, props }) as ComponentData;
}

export const templateData = (
	config: Config,
	template: PageTemplate,
): Pick<Data, "content"> => ({
	content: template.blocks
		.filter((draft) => draft.type in config.components)
		.map((draft) => build(config, draft)),
});
