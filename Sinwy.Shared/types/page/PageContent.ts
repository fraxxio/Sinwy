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

export type PageContentV1 = {
	schemaVersion: 1;
	widgets: PageWidget[];
};

/** A Puck document; its props belong to the page builder config. */
export type PuckComponentData = {
	type: string;
	props: Record<string, unknown> & { id: string };
};

export type PuckDocument = {
	root: { props?: Record<string, unknown> };
	content: PuckComponentData[];
	zones?: Record<string, PuckComponentData[]>;
};

export type PageContentV2 = {
	schemaVersion: 2;
	data: PuckDocument;
};

export type PageContent = PageContentV1 | PageContentV2;

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
	if (content.schemaVersion !== 1) return types;
	eachWidget(content.widgets, (widget) => types.add(widget.type));
	return types;
};

const pageContentV1Schema = z
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
	}) satisfies z.ZodType<PageContentV1>;

const puckComponentSchema = z.looseObject({
	type: z.string().min(1),
	props: z.looseObject({ id: z.string().min(1) }),
});

const pageContentV2Schema = z.strictObject({
	schemaVersion: z.literal(2),
	data: z.looseObject({
		root: z.looseObject({}),
		content: z.array(puckComponentSchema),
	}),
}) as z.ZodType<PageContentV2>;

const isComponent = (value: unknown): value is PuckComponentData =>
	typeof value === "object" &&
	value !== null &&
	"type" in value &&
	"props" in value;

/** Components in a Puck document, counting those nested in slots; slots are prop arrays of components. */
export const countPuckComponents = (components: PuckComponentData[]): number =>
	components.reduce(
		(sum, component) =>
			sum +
			1 +
			Object.values(component.props).reduce<number>(
				(nested, value) =>
					Array.isArray(value) && value.every(isComponent)
						? nested + countPuckComponents(value)
						: nested,
				0,
			),
		0,
	);

/** Widgets in version 1, components in version 2. */
export const pageContentSize = (content: PageContent): number => {
	if (content.schemaVersion === 2)
		return countPuckComponents(content.data.content);
	let count = 0;
	eachWidget(content.widgets, () => count++);
	return count;
};

export const pageContentSchema = z.union([
	pageContentV1Schema,
	pageContentV2Schema,
]) satisfies z.ZodType<PageContent>;
