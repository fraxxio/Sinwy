import type { ComponentConfig, CustomField, Field } from "@puckeditor/core";
import { FreeGridEditor, FreeGridLayoutField } from "./FreeGridEditor";
import { ResponsiveField } from "./ResponsiveField";
import {
	type BuilderConfig,
	blocks,
	columnCount,
	renderConfig,
	withVisibilityAll,
} from "./render-config";
import { responsiveOptions } from "./responsive";
import { ServicePicker } from "./ServicePicker";

const c = blocks;

/** Swaps the storefront's inert placeholder for the viewport-aware control on every field marked `metadata.responsive`. */
const withResponsiveFields = (
	components: BuilderConfig["components"],
): BuilderConfig["components"] =>
	Object.fromEntries(
		Object.entries(components).map(([type, component]) => {
			const { fields = {} } = component as unknown as ComponentConfig;
			return [
				type,
				{
					...component,
					fields: Object.fromEntries(
						Object.entries(fields).map(([name, field]: [string, Field]) => [
							name,
							field.type === "custom" && responsiveOptions(field)
								? ({
										...field,
										render: (props) => (
											<ResponsiveField {...props} field={field} />
										),
									} satisfies CustomField<unknown>)
								: field,
						]),
					),
				},
			];
		}),
	) as unknown as BuilderConfig["components"];

const heroItems = [
	{ type: "Heading", props: { text: "Look good, feel great", level: "1" } },
	{
		type: "RichText",
		props: {
			content:
				"<p>Cuts, colour and styling by people who take the time to listen.</p>",
		},
	},
	{
		type: "Button",
		props: { label: "Book now", href: "book", variant: "outline" },
	},
];

const servicesItems = [
	{
		type: "Heading",
		props: { text: "Our services", level: "2", align: { base: "center" } },
	},
	{
		type: "RichText",
		props: {
			content:
				"<p>Pick a service to see open times. Not sure what you need? <strong>Book a consultation</strong> and we'll help.</p>",
		},
	},
	{ type: "BookingWidget", props: { title: "", serviceIds: [] } },
];

export const editorConfig: BuilderConfig = {
	...renderConfig,
	categories: {
		sections: {
			title: "Ready-made sections",
			components: ["Hero", "ServicesSection"],
		},
		layout: {
			title: "Layout",
			components: ["Section", "Columns", "Container", "FreeGrid"],
		},
		content: {
			title: "Content",
			components: ["Heading", "RichText", "Image", "Button", "BookingWidget"],
		},
	},
	root: {
		...renderConfig.root,
		defaultProps: { radius: "medium", spacing: "comfortable" },
	},
	components: withResponsiveFields(
		withVisibilityAll({
			Section: {
				...c.Section,
				label: "Section",
				defaultProps: { items: [], tone: "plain", padding: { base: "medium" } },
			},
			Hero: {
				...c.Hero,
				label: "Hero",
				defaultProps: {
					items: heroItems as never,
					image: "",
					align: { base: "center" },
				},
			},
			ServicesSection: {
				...c.ServicesSection,
				label: "Services",
				defaultProps: {
					items: servicesItems as never,
					tone: "muted",
					padding: { base: "medium" },
				},
			},
			Columns: {
				...c.Columns,
				label: "Columns",
				defaultProps: {
					count: { base: "2", mobile: "1" },
					column1: [],
					column2: [],
					column3: [],
					column4: [],
				},
				resolveFields: (data, { fields }) => {
					const count = Number(columnCount(data.props.count).base);
					return Object.fromEntries(
						Object.entries(fields).filter(
							([name]) =>
								!name.startsWith("column") || Number(name.slice(6)) <= count,
						),
					) as typeof fields;
				},
			},
			Container: {
				...c.Container,
				label: "Container",
				defaultProps: {
					items: [],
					width: { base: "medium" },
					align: { base: "start" },
				},
			},
			Heading: {
				...c.Heading,
				label: "Heading",
				defaultProps: {
					text: "Heading",
					level: "2",
					align: { base: "start" },
				},
			},
			RichText: {
				...c.RichText,
				label: "Text",
				defaultProps: {
					content: "<p>Write something your customers should know.</p>",
				},
			},
			Image: {
				...c.Image,
				label: "Image",
				defaultProps: { src: "", alt: "", aspect: "wide" },
			},
			Button: {
				...c.Button,
				label: "Button",
				defaultProps: {
					label: "Book now",
					href: "book",
					variant: "primary",
					align: { base: "start" },
				},
			},
			BookingWidget: {
				...c.BookingWidget,
				label: "Booking widget",
				fields: {
					title: { type: "text", label: "Title", contentEditable: true },
					serviceIds: {
						type: "custom",
						label: "Services",
						render: ({ value, onChange }) => (
							<ServicePicker value={value} onChange={onChange} />
						),
					},
				},
				defaultProps: { title: "Book an appointment", serviceIds: [] },
			},
			FreeGrid: {
				...c.FreeGrid,
				label: "Free grid",
				fields: {
					items: { type: "slot" },
					layout: {
						type: "custom",
						label: "Arrangement",
						render: ({ value, onChange }) => (
							<FreeGridLayoutField value={value} onChange={onChange} />
						),
					},
				},
				defaultProps: { items: [], layout: { desktop: {} } },
				render: (props) =>
					props.puck.isEditing ? (
						<FreeGridEditor {...props} />
					) : (
						<c.FreeGrid.render {...props} />
					),
			},
		}),
	),
};
