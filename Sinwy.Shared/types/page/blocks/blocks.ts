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
	description: "A band across the page that holds text, photos and buttons.",
	group: "layout",
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
		items: field.slot({ allow: [...CONTENT, "Columns", "Photos"] }),
	},
});

const column = () => field.slot({ allow: CONTENT });

const Columns = defineBlock({
	label: "Columns",
	description: "Splits a band into two, three or four columns side by side.",
	group: "layout",
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
	description: "A title that introduces a part of your page.",
	group: "content",
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
	description: "A paragraph of text, with bold words, links and lists.",
	group: "content",
	fields: {
		content: field.richText({
			label: "Text",
			default: "<p>Write something your customers should know.</p>",
		}),
	},
});

const Image = defineBlock({
	label: "Image",
	description: "A single photo.",
	group: "content",
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
	description: "A button that takes customers to booking or another page.",
	group: "content",
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
	description:
		"A big welcome banner for the top of your page, with a booking button.",
	group: "ready",
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
	description:
		"Your services with their prices, each with its own Book button.",
	group: "ready",
	fields: {
		title: field.text({ label: "Title", default: "Our services" }),
		intro: field.richText({ label: "Introduction" }),
		serviceIds: field.serviceIds({ label: "Services" }),
	},
});

const Photos = defineBlock({
	label: "Photos",
	description: "Two or more photos side by side.",
	group: "ready",
	fields: {
		gap: field.select({
			label: "Space between photos",
			options: [
				{ value: "none", label: "None" },
				{ value: "small", label: "Small" },
				{ value: "medium", label: "Medium" },
				{ value: "large", label: "Large" },
			],
			default: "medium",
		}),
		phoneLayout: field.select({
			label: "On a phone",
			options: [
				{ value: "row", label: "Side by side" },
				{ value: "stack", label: "Stacked" },
			],
			default: "stack",
			display: "radio",
		}),
		items: field.slot({
			allow: ["Image"],
			default: [
				{ type: "Image", props: { aspect: "square" } },
				{ type: "Image", props: { aspect: "square" } },
			],
		}),
	},
});

const Booking = defineBlock({
	label: "Booking",
	description:
		'A "Book online" panel that takes customers straight to booking.',
	group: "ready",
	requires: "premium-blocks",
	fields: {
		title: field.text({ label: "Title", default: "Book online" }),
		intro: field.richText({
			label: "Introduction",
			default: "<p>Pick a service and a time that suits you.</p>",
		}),
		serviceIds: field.serviceIds({ label: "Services" }),
	},
});

/** In the order the editor's block drawer lists them within each group. */
export const BLOCKS = {
	Hero,
	Services,
	Photos,
	Booking,
	Heading,
	RichText,
	Image,
	Button,
	Section,
	Columns,
} satisfies Record<string, BlockDefinition>;

export type BlockType = keyof typeof BLOCKS;

export type Blocks = Record<string, BlockDefinition>;

/** Looks up a stored block type without reaching inherited keys like `constructor`. */
export const ownEntry = <T>(
	record: Partial<Record<string, T>>,
	type: string,
): T | undefined => (Object.hasOwn(record, type) ? record[type] : undefined);

/** Block types a page accepts at the top level. */
export const ROOT_ALLOW: readonly BlockType[] = [
	"Section",
	"Hero",
	"Services",
	"Photos",
	"Booking",
];

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
