import { Button } from "#/shared/components/ui/button";
import { FreeGridEditor } from "./FreeGridEditor";
import { type BuilderConfig, renderConfig } from "./render-config";
import { ServicePicker } from "./ServicePicker";

const c = renderConfig.components;

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
		props: { text: "Our services", level: "2", align: "center" },
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
	components: {
		Section: {
			...c.Section,
			label: "Section",
			defaultProps: { items: [], tone: "plain" },
		},
		Hero: {
			...c.Hero,
			label: "Hero",
			defaultProps: {
				items: heroItems as never,
				image: "",
				align: "center",
			},
		},
		ServicesSection: {
			...c.ServicesSection,
			label: "Services",
			defaultProps: { items: servicesItems as never, tone: "muted" },
		},
		Columns: {
			...c.Columns,
			label: "Columns",
			defaultProps: {
				count: "2",
				column1: [],
				column2: [],
				column3: [],
				column4: [],
			},
			resolveFields: (data, { fields }) => {
				const count = Number(data.props.count) || 2;
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
			defaultProps: { items: [], width: "medium", align: "start" },
		},
		Heading: {
			...c.Heading,
			label: "Heading",
			defaultProps: { text: "Heading", level: "2", align: "start" },
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
				align: "start",
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
					render: ({ onChange }) => (
						<div className="grid gap-2 text-muted-foreground text-sm">
							<p>
								Drag a block's ⠿ handle to move it, and its edges to resize it.
							</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onChange({ desktop: {} })}
							>
								Reset layout
							</Button>
						</div>
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
	},
};
