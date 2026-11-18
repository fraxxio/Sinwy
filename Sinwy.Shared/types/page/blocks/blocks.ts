import {
	type BlockDefinition,
	defineBlock,
	field,
	type PropsOf,
} from "./fields";

const align = (fallback: "start" | "center") =>
	field.select({
		label: "Alignment",
		options: [
			{ value: "start", label: "Left" },
			{ value: "center", label: "Centre" },
		],
		default: fallback,
		display: "radio",
	});

const tone = (fallback: "plain" | "muted" | "brand") =>
	field.select({
		label: "Background",
		options: [
			{ value: "plain", label: "Plain" },
			{ value: "muted", label: "Muted" },
			{ value: "brand", label: "Brand" },
		],
		default: fallback,
		display: "radio",
	});

const CONTENT = ["Heading", "RichText", "Image", "Button"] as const;

const Section = defineBlock({
	label: "Section",
	fields: {
		tone: tone("plain"),
		padding: field.select({
			label: "Padding",
			options: [
				{ value: "none", label: "None" },
				{ value: "small", label: "Small" },
				{ value: "medium", label: "Medium" },
				{ value: "large", label: "Large" },
			],
			default: "medium",
		}),
		items: field.slot({ allow: [...CONTENT, "Columns"] }),
	},
});

const column = () => field.slot({ allow: CONTENT });

const Columns = defineBlock({
	label: "Columns",
	fields: {
		count: field.select({
			label: "Columns",
			options: [
				{ value: "2", label: "2" },
				{ value: "3", label: "3" },
				{ value: "4", label: "4" },
			],
			default: "2",
			display: "radio",
		}),
		column1: column(),
		column2: column(),
		column3: column(),
		column4: column(),
	},
});

const Heading = defineBlock({
	label: "Heading",
	fields: {
		text: field.text({ label: "Text", default: "Heading" }),
		size: field.select({
			label: "Size",
			options: [
				{ value: "1", label: "Large" },
				{ value: "2", label: "Medium" },
				{ value: "3", label: "Small" },
			],
			default: "2",
		}),
		align: align("start"),
	},
});

const RichText = defineBlock({
	label: "Text",
	fields: {
		content: field.richText({
			label: "Text",
			default: "<p>Write something your customers should know.</p>",
		}),
	},
});

const Image = defineBlock({
	label: "Image",
	fields: {
		src: field.image({ label: "Image URL" }),
		alt: field.text({ label: "Description (for screen readers)" }),
		aspect: field.select({
			label: "Shape",
			options: [
				{ value: "auto", label: "Original" },
				{ value: "square", label: "Square" },
				{ value: "wide", label: "Wide" },
			],
			default: "wide",
		}),
	},
});

const Button = defineBlock({
	label: "Button",
	fields: {
		label: field.text({ label: "Label", default: "Book now" }),
		href: field.link({ label: "Link", default: "book" }),
		variant: field.select({
			label: "Style",
			options: [
				{ value: "primary", label: "Filled" },
				{ value: "outline", label: "Outline" },
			],
			default: "primary",
			display: "radio",
		}),
		align: align("start"),
	},
});

const Hero = defineBlock({
	label: "Hero",
	fields: {
		image: field.image({ label: "Background image URL" }),
		align: align("center"),
		items: field.slot({
			allow: ["Heading", "RichText", "Button"],
			default: [
				{
					type: "Heading",
					props: { text: "Look good, feel great", size: "1" },
				},
				{
					type: "RichText",
					props: {
						content: "<p>Book your next appointment online in a minute.</p>",
					},
				},
				{ type: "Button", props: { label: "Book now", href: "book" } },
			],
		}),
	},
});

const Services = defineBlock({
	label: "Services",
	fields: {
		title: field.text({ label: "Title", default: "Our services" }),
		intro: field.richText({ label: "Introduction" }),
		serviceIds: field.serviceIds({ label: "Services" }),
	},
});

export const BLOCKS = {
	Section,
	Columns,
	Heading,
	RichText,
	Image,
	Button,
	Hero,
	Services,
} satisfies Record<string, BlockDefinition>;

export type BlockType = keyof typeof BLOCKS;

export type Blocks = Record<string, BlockDefinition>;

/** Block types a page accepts at the top level. */
export const ROOT_ALLOW: readonly BlockType[] = ["Section", "Hero", "Services"];

/** Stored props of a block type besides `id`. */
export type BlockProps<T extends BlockType> =
	(typeof BLOCKS)[T] extends BlockDefinition<infer F> ? PropsOf<F> : never;

export type BlockMigration = (
	props: Record<string, unknown>,
) => Record<string, unknown>;

/**
 * Prop renames and reshapes per block type, applied in order on read and on save. Each must be idempotent and must
 * leave the slots' lists in place.
 */
export const BLOCK_MIGRATIONS: Partial<
	Record<string, readonly BlockMigration[]>
> = {};
