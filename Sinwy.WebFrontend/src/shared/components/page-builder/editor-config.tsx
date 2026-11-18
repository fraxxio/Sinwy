import {
	AutoField,
	type ComponentConfig,
	type ComponentData,
	type CustomField,
	type Field,
	type Permissions,
} from "@puckeditor/core";
import { BLOCKS, type BlockSpec, type Feature } from "@sinwy/shared";
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

/** Fields shown but never editable. Static, so no `resolveData` pass has to add a `readOnly` map (and a history entry). */
const LOCKED_FIELDS: Record<string, readonly string[]> = {
	ServicesSection: ["tone", "padding"],
};

const withLockedFields = (
	components: BuilderConfig["components"],
): BuilderConfig["components"] =>
	Object.fromEntries(
		Object.entries(components).map(([type, component]) => {
			const locked = LOCKED_FIELDS[type];
			const { fields = {} } = component as unknown as ComponentConfig;
			if (!locked) return [type, component];
			return [
				type,
				{
					...component,
					fields: Object.fromEntries(
						Object.entries(fields).map(([name, field]: [string, Field]) => [
							name,
							locked.includes(name)
								? ({
										type: "custom",
										render: ({ id, value, onChange }) => (
											<AutoField
												field={field}
												id={id}
												value={value}
												onChange={onChange}
												readOnly
											/>
										),
									} satisfies CustomField<unknown>)
								: field,
						]),
					),
				},
			];
		}),
	) as unknown as BuilderConfig["components"];

/** Ready-made sections whose first block of each listed type stays put: editable, but not deleted or moved out. */
const REQUIRED_CHILDREN: Record<string, readonly string[]> = {
	Hero: ["Heading", "Button"],
};

/** Ready-made sections whose layout is fixed: children can be edited, not added, moved or removed. */
const LOCKED_LAYOUTS = new Set(["ServicesSection"]);

const isRequiredChild = (
	type: string,
	id: string,
	parent: ComponentData | null | undefined,
) => {
	if (!parent || !REQUIRED_CHILDREN[parent.type]?.includes(type)) return false;
	const items = parent.props["items"] as ComponentData[] | undefined;
	return items?.find((item) => item.type === type)?.props.id === id;
};

const pinned: Partial<Permissions> = {
	delete: false,
	drag: false,
	duplicate: false,
};

const guard =
	(type: string): NonNullable<ComponentConfig["resolvePermissions"]> =>
	(data, { parent, permissions }) =>
		(parent && LOCKED_LAYOUTS.has(parent.type)) ||
		isRequiredChild(type, data.props.id, parent)
			? { ...permissions, ...pinned }
			: permissions;

const withGuardrails = (
	components: BuilderConfig["components"],
): BuilderConfig["components"] =>
	Object.fromEntries(
		Object.entries(components).map(([type, component]) => [
			type,
			{ ...component, resolvePermissions: guard(type) },
		]),
	) as unknown as BuilderConfig["components"];

const heroItems = [
	{ type: "Heading", props: { text: "Look good, feel great", size: "1" } },
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
		props: { text: "Our services", size: "2", align: { base: "center" } },
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
	components: withGuardrails(
		withLockedFields(
			withResponsiveFields(
				withVisibilityAll({
					Section: {
						...c.Section,
						label: "Section",
						defaultProps: {
							items: [],
							tone: "plain",
							padding: { base: "medium" },
						},
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
						fields: {
							...(c.ServicesSection.fields as NonNullable<
								typeof c.ServicesSection.fields
							>),
							items: { type: "slot", allow: [] },
						},
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
										!name.startsWith("column") ||
										Number(name.slice(6)) <= count,
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
							size: "2",
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
		),
	),
};

const specs: Record<string, BlockSpec | undefined> = BLOCKS;

/** Drops locked blocks from a ready-made section's default children, nested ones included. */
const withoutLocked = (
	value: unknown,
	locked: (type: string) => boolean,
): unknown =>
	Array.isArray(value)
		? value
				.filter((item) => !locked(item?.type))
				.map((item) =>
					item?.props
						? {
								...item,
								props: Object.fromEntries(
									Object.entries(item.props).map(([name, prop]) => [
										name,
										withoutLocked(prop, locked),
									]),
								),
							}
						: item,
				)
		: value;

/**
 * Blocks the plan lacks leave the drawer and the ready-made sections. They stay in the config, so a page that
 * already has one still renders and edits; the server refuses a newly added one.
 */
export function editorConfigFor(features: readonly Feature[]): BuilderConfig {
	const locked = (type: string) => {
		const requires = specs[type]?.requires;
		return !!requires && !features.includes(requires);
	};
	if (!Object.keys(BLOCKS).some(locked)) return editorConfig;
	const components = Object.fromEntries(
		Object.entries(editorConfig.components).map(([type, component]) => {
			const { defaultProps } = component as unknown as ComponentConfig;
			return [
				type,
				defaultProps
					? {
							...component,
							defaultProps: Object.fromEntries(
								Object.entries(defaultProps).map(([name, value]) => [
									name,
									withoutLocked(value, locked),
								]),
							),
						}
					: component,
			];
		}),
	) as unknown as BuilderConfig["components"];
	const categories = Object.fromEntries(
		Object.entries(editorConfig.categories ?? {}).map(([name, category]) => [
			name,
			{
				...category,
				components: category.components?.filter((type) => !locked(type)),
			},
		]),
	);
	return {
		...editorConfig,
		components,
		categories: { ...categories, other: { visible: false } },
	};
}
