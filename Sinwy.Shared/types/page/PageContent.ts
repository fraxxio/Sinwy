import { z } from "zod";
import type { Feature } from "../plan";

export type WidgetDefinition = {
	label: string;
	/** Saving a new widget of this type needs the feature; existing ones stay editable. */
	requires?: Feature;
};

const widgetTypes = {
	heading: { label: "Heading" },
	text: { label: "Text" },
	image: { label: "Image" },
	button: { label: "Button" },
	gallery: { label: "Gallery", requires: "advanced-widgets" },
	testimonials: { label: "Testimonials", requires: "advanced-widgets" },
} satisfies Record<string, WidgetDefinition>;

export type WidgetType = keyof typeof widgetTypes;

export const WIDGET_TYPES: Record<WidgetType, WidgetDefinition> = widgetTypes;

const widgetTypeNames = Object.keys(widgetTypes) as [
	WidgetType,
	...WidgetType[],
];

export const PAGE_CONTENT_LIMITS = {
	maxDepth: 5,
	maxWidgets: 200,
	widgetId: 64,
} as const;

/** Props belong to the page builder, so only their shape is checked here. */
export type PageWidget = {
	id: string;
	type: WidgetType;
	props: Record<string, unknown>;
	children?: PageWidget[];
};

export type PageContent = {
	schemaVersion: 1;
	widgets: PageWidget[];
};

const widgetList = (schema: z.ZodType<PageWidget>) =>
	z
		.array(schema)
		.max(
			PAGE_CONTENT_LIMITS.maxWidgets,
			`A page holds at most ${PAGE_CONTENT_LIMITS.maxWidgets} widgets`,
		);

// One schema per nesting level, so an over-deep tree is refused without recursing into it.
const widgetAt = (depth: number): z.ZodType<PageWidget> =>
	z.object({
		id: z.string().min(1).max(PAGE_CONTENT_LIMITS.widgetId),
		type: z.enum(widgetTypeNames, "Unknown widget type"),
		props: z.record(z.string(), z.unknown()),
		children:
			depth < PAGE_CONTENT_LIMITS.maxDepth
				? widgetList(widgetAt(depth + 1)).optional()
				: z
						.array(z.unknown())
						.max(
							0,
							`Widgets nest at most ${PAGE_CONTENT_LIMITS.maxDepth} levels deep`,
						)
						.optional(),
	}) as z.ZodType<PageWidget>;

const eachWidget = (
	widgets: PageWidget[],
	visit: (widget: PageWidget) => void,
) => {
	for (const widget of widgets) {
		visit(widget);
		if (widget.children) eachWidget(widget.children, visit);
	}
};

/** Every widget type a content tree uses, nested ones included. */
export const widgetTypesIn = (content: PageContent): Set<WidgetType> => {
	const types = new Set<WidgetType>();
	eachWidget(content.widgets, (widget) => types.add(widget.type));
	return types;
};

export const pageContentSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		widgets: widgetList(widgetAt(1)),
	})
	.superRefine((content, ctx) => {
		const ids = new Set<string>();
		let count = 0;
		eachWidget(content.widgets, (widget) => {
			count++;
			if (ids.has(widget.id))
				ctx.addIssue({
					code: "custom",
					path: ["widgets"],
					message: `Widget id "${widget.id}" is used twice`,
				});
			ids.add(widget.id);
		});
		if (count > PAGE_CONTENT_LIMITS.maxWidgets)
			ctx.addIssue({
				code: "custom",
				path: ["widgets"],
				message: `A page holds at most ${PAGE_CONTENT_LIMITS.maxWidgets} widgets`,
			});
	}) satisfies z.ZodType<PageContent>;
