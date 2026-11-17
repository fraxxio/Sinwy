import type { ComponentConfig, Config, RichText, Slot } from "@puckeditor/core";
import type { PublicServiceDto } from "@sinwy/shared";
import {
	Children,
	type CSSProperties,
	isValidElement,
	type ReactNode,
} from "react";
import { buttonVariants } from "#/shared/components/ui/button";
import { brandAttributes } from "#/shared/lib/branding";
import { formatMinorUnits } from "#/shared/lib/money";
import { imageSrc, resolveHref } from "#/shared/lib/page-urls";
import { cn } from "#/shared/lib/utils";
import {
	type FreeGridLayout,
	gridStyle,
	placementsByChild,
} from "./free-grid-layout";
import {
	BREAKPOINTS,
	hiddenOn,
	mapResolved,
	type Responsive,
	resolveResponsive,
	responsiveField,
	responsiveVars,
} from "./responsive";
import { builderMetadata, type ThemeTokens, tokenStyle } from "./theme-tokens";

export type HeadingLevel = "1" | "2" | "3";
type Tone = "plain" | "muted" | "brand";
type ColumnCount = "1" | "2" | "3" | "4";
type Align = "start" | "center";
type Padding = "none" | "small" | "medium" | "large";
type Width = "narrow" | "medium" | "full";

export type BuilderComponents = {
	Section: { items: Slot; tone: Tone; padding: Responsive<Padding> };
	Hero: { items: Slot; image: string; align: Responsive<Align> };
	ServicesSection: { items: Slot; tone: Tone; padding: Responsive<Padding> };
	Columns: {
		count: Responsive<ColumnCount>;
		column1: Slot;
		column2: Slot;
		column3: Slot;
		column4: Slot;
	};
	Container: {
		items: Slot;
		width: Responsive<Width>;
		align: Responsive<Align>;
	};
	Heading: { text: string; level: HeadingLevel; align: Responsive<Align> };
	RichText: { content: RichText };
	Image: { src: string; alt: string; aspect: "auto" | "square" | "wide" };
	Button: {
		label: string;
		href: string;
		variant: "primary" | "outline";
		align: Responsive<Align>;
	};
	BookingWidget: { title: string; serviceIds: string[] };
	FreeGrid: { items: Slot; layout: FreeGridLayout };
};

export type BuilderConfig = Config<{
	components: BuilderComponents;
	root: Partial<ThemeTokens>;
}>;

/** Each enum a user can choose maps to one fixed class string, so Tailwind sees every class at build time. */
const known = <T extends Record<string, string>>(
	map: T,
	key: unknown,
	fallback: keyof T,
): string =>
	(typeof key === "string" && Object.hasOwn(map, key)
		? map[key]
		: map[fallback]) as string;

const HEADINGS: Record<HeadingLevel, string> = {
	"1": "text-3xl font-heading font-semibold tracking-tight text-balance sm:text-5xl",
	"2": "text-2xl font-heading font-semibold tracking-tight text-balance sm:text-3xl",
	"3": "text-xl font-heading font-medium",
};

const TONES: Record<Tone, string> = {
	plain: "",
	muted: "bg-muted",
	brand: "bg-primary text-primary-foreground",
};

/** Per-breakpoint values arrive as `responsiveVars`; these classes read them, the overrides inside Tailwind's `max-lg` and `max-sm`. */
const RESPONSIVE = {
	align:
		"[text-align:var(--pb-align)] max-lg:[text-align:var(--pb-align-t)] max-sm:[text-align:var(--pb-align-m)]",
	cols: "grid-cols-(--pb-cols) max-lg:grid-cols-(--pb-cols-t) max-sm:grid-cols-(--pb-cols-m)",
	width:
		"max-w-(--pb-width) max-lg:max-w-(--pb-width-t) max-sm:max-w-(--pb-width-m)",
	pad: "p-(--pb-pad) max-lg:p-(--pb-pad-t) max-sm:p-(--pb-pad-m)",
	cell: "col-(--pb-col) row-(--pb-row) max-lg:col-(--pb-col-t) max-lg:row-(--pb-row-t) max-sm:col-(--pb-col-m) max-sm:row-(--pb-row-m)",
};

const ALIGNS: readonly Align[] = ["start", "center"];

/** Text alignment inherits, so it lines up the same with or without the editor's wrapper around each slot child. Left-only blocks set nothing and follow their parent. */
const alignment = (value: unknown, fallback: Align) => {
	const resolved = resolveResponsive(value, ALIGNS, fallback);
	if (!BREAKPOINTS.some((breakpoint) => resolved[breakpoint] === "center"))
		return { className: "", style: {} };
	return {
		className: RESPONSIVE.align,
		style: responsiveVars(
			"align",
			mapResolved(resolved, (align) =>
				align === "center" ? "center" : "left",
			),
		),
	};
};

const COLUMN_COUNTS: readonly ColumnCount[] = ["1", "2", "3", "4"];

/** Pages saved before columns were responsive stacked on phones and showed at most two on tablets. */
export const columnCount = (count: unknown) =>
	resolveResponsive(
		typeof count === "string"
			? { base: count, tablet: count === "1" ? "1" : "2", mobile: "1" }
			: count,
		COLUMN_COUNTS,
		"2",
	);

const WIDTHS: Record<Width, string> = {
	narrow: "36rem",
	medium: "48rem",
	full: "none",
};

const PADDINGS: Record<Padding, string> = {
	none: "0px",
	small: "calc(var(--pb-space) / 2)",
	medium: "var(--pb-space)",
	large: "calc(var(--pb-space) * 2)",
};

const ASPECTS = {
	auto: "",
	square: "aspect-square",
	wide: "aspect-video",
};

/** Descendant selectors, because the editor nests Puck's own wrappers around the same tags. */
const RICH_TEXT =
	"text-pretty leading-relaxed [&_:is(p,ul,ol,h2,h3,blockquote,hr):not(:first-child)]:mt-3 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:font-heading [&_h2]:font-semibold [&_h2]:text-2xl [&_h3]:font-heading [&_h3]:font-medium [&_h3]:text-xl [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6";

const slotGrid = "grid content-start gap-(--pb-space)";

/** Wraps each slot child (keyed by its id) in its grid cell, placed per breakpoint. */
function FreeGridCells({
	layout,
	children,
	...rest
}: {
	layout: Partial<FreeGridLayout> | undefined;
	children?: ReactNode;
	className?: string;
}) {
	const items = Children.toArray(children).filter(isValidElement);
	const ids = items.map((child) => String(child.key).replace(/^\.\$/, ""));
	const placements = placementsByChild(ids, layout);
	return (
		<div {...rest} style={gridStyle}>
			{items.map((child, index) => {
				const placement = placements[index];
				return (
					<div
						key={child.key}
						data-pb-cell=""
						className={RESPONSIVE.cell}
						style={
							placement && {
								...responsiveVars("col", placement.column),
								...responsiveVars("row", placement.row),
							}
						}
					>
						{child}
					</div>
				);
			})}
		</div>
	);
}

const shownServices = (services: PublicServiceDto[], ids: unknown) =>
	Array.isArray(ids) && ids.length > 0
		? ids.flatMap((id) => services.filter((service) => service.id === id))
		: services;

function BookingWidget({
	title,
	services,
	organizationSlug,
}: {
	title: string;
	services: PublicServiceDto[];
	organizationSlug: string;
}) {
	return (
		<div className="grid gap-3">
			{title && <h3 className="font-heading font-medium text-xl">{title}</h3>}
			{services.length === 0 ? (
				<p className="rounded-(--pb-radius) border border-dashed p-(--pb-space) text-muted-foreground text-sm">
					No services to show yet.
				</p>
			) : (
				<ul className="divide-y overflow-hidden rounded-(--pb-radius) border bg-card text-left text-card-foreground">
					{services.map((service) => (
						<li key={service.id} className="flex items-center gap-4 p-4">
							<div className="min-w-0 flex-1 space-y-1">
								<p className="font-medium">{service.name}</p>
								{service.description && (
									<p className="line-clamp-2 text-muted-foreground text-sm">
										{service.description}
									</p>
								)}
								<p className="text-muted-foreground text-sm">
									{service.durationMinutes} min ·{" "}
									{formatMinorUnits(service.priceMinor, service.currency)}
								</p>
							</div>
							<a
								href={`/${organizationSlug}/book?service=${encodeURIComponent(service.id)}`}
								className={cn(
									buttonVariants({ size: "sm" }),
									"rounded-(--pb-radius)",
								)}
							>
								Book
							</a>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

const alignField = (fallback: Align) =>
	responsiveField("Alignment", {
		options: [
			{ label: "Left", value: "start" },
			{ label: "Centre", value: "center" },
		],
		fallback,
	});

const visibilityField = responsiveField("Visibility", {
	options: [
		{ label: "Show", value: "show" },
		{ label: "Hide", value: "hide" },
	],
	fallback: "show",
});

/** Every block can be hidden per breakpoint. The stylesheet hides it; the editor fades it instead so it stays selectable. */
function withVisibility(component: ComponentConfig): ComponentConfig {
	return {
		...component,
		fields: { ...component.fields, visibility: visibilityField },
		render: (props) => {
			const content = component.render(props);
			const hide = hiddenOn(props["visibility"]);
			if (!hide) return content;
			return (
				<div
					data-pb-hide={hide}
					data-pb-editing={props.puck.isEditing || undefined}
				>
					{content}
				</div>
			);
		},
	};
}

export const withVisibilityAll = (
	components: BuilderConfig["components"],
): BuilderConfig["components"] =>
	Object.fromEntries(
		Object.entries(components).map(([type, component]) => [
			type,
			withVisibility(component as unknown as ComponentConfig),
		]),
	) as unknown as BuilderConfig["components"];

const section: ComponentConfig<BuilderComponents["Section"]> = {
	fields: {
		items: { type: "slot" },
		tone: {
			type: "radio",
			label: "Background",
			options: [
				{ label: "Plain", value: "plain" },
				{ label: "Muted", value: "muted" },
				{ label: "Brand", value: "brand" },
			],
		},
		padding: responsiveField("Padding", {
			options: [
				{ label: "None", value: "none" },
				{ label: "Small", value: "small" },
				{ label: "Medium", value: "medium" },
				{ label: "Large", value: "large" },
			],
			fallback: "medium",
		}),
	},
	render: ({ items: Items, tone, padding }) => (
		<section
			style={responsiveVars(
				"pad",
				mapResolved(
					resolveResponsive(
						padding,
						Object.keys(PADDINGS) as Padding[],
						"medium",
					),
					(size) => PADDINGS[size],
				),
			)}
			className={cn(
				"rounded-(--pb-radius)",
				RESPONSIVE.pad,
				known(TONES, tone, "plain"),
			)}
		>
			<Items className={slotGrid} />
		</section>
	),
};

/** Block configs before `withVisibility`, for the editor config to extend. */
export const blocks: BuilderConfig["components"] = {
	Section: section,
	ServicesSection: section,
	Hero: {
		fields: {
			items: { type: "slot" },
			image: { type: "text", label: "Background image URL" },
			align: alignField("center"),
		},
		render: ({ items: Items, image, align }) => {
			const src = imageSrc(image);
			const aligned = alignment(align, "center");
			return (
				<section
					style={
						src
							? ({
									"--pb-hero-image": `url(${JSON.stringify(src)})`,
								} as CSSProperties)
							: undefined
					}
					className={cn(
						"relative isolate overflow-hidden rounded-(--pb-radius) px-(--pb-space) py-16 sm:py-24",
						src
							? "bg-(image:--pb-hero-image) bg-center bg-cover text-white before:absolute before:inset-0 before:-z-10 before:bg-black/50"
							: "bg-primary text-primary-foreground",
					)}
				>
					<Items
						className={cn(
							"mx-auto grid max-w-2xl gap-(--pb-space)",
							aligned.className,
						)}
						style={aligned.style}
					/>
				</section>
			);
		},
	},
	Columns: {
		fields: {
			count: responsiveField("Columns", {
				options: COLUMN_COUNTS.map((count) => ({
					label: count,
					value: count,
				})),
				fallback: "2",
			}),
			column1: { type: "slot" },
			column2: { type: "slot" },
			column3: { type: "slot" },
			column4: { type: "slot" },
		},
		render: ({ count, column1, column2, column3, column4 }) => {
			const counts = columnCount(count);
			const slots = Number(counts.base);
			const columns = [column1, column2, column3, column4].slice(0, slots);
			return (
				<div
					style={responsiveVars(
						"cols",
						mapResolved(
							counts,
							(perRow) =>
								`repeat(${Math.min(Number(perRow), slots)}, minmax(0, 1fr))`,
						),
					)}
					className={cn("grid gap-(--pb-space)", RESPONSIVE.cols)}
				>
					{columns.map((Column, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed positions
						<Column key={index} className={cn(slotGrid, "min-h-16")} />
					))}
				</div>
			);
		},
	},
	Container: {
		fields: {
			items: { type: "slot" },
			width: responsiveField("Width", {
				options: [
					{ label: "Narrow", value: "narrow" },
					{ label: "Medium", value: "medium" },
					{ label: "Full", value: "full" },
				],
				fallback: "medium",
			}),
			align: alignField("start"),
		},
		render: ({ items: Items, width, align }) => {
			const aligned = alignment(align, "start");
			return (
				<Items
					className={cn(
						slotGrid,
						"mx-auto w-full",
						RESPONSIVE.width,
						aligned.className,
					)}
					style={{
						...responsiveVars(
							"width",
							mapResolved(
								resolveResponsive(
									width,
									Object.keys(WIDTHS) as Width[],
									"medium",
								),
								(size) => WIDTHS[size],
							),
						),
						...aligned.style,
					}}
				/>
			);
		},
	},
	Heading: {
		fields: {
			text: { type: "text", label: "Text", contentEditable: true },
			level: {
				type: "select",
				label: "Size",
				options: [
					{ label: "Large", value: "1" },
					{ label: "Medium", value: "2" },
					{ label: "Small", value: "3" },
				],
			},
			align: alignField("start"),
		},
		render: ({ text, level, align }) => {
			const safe = level in HEADINGS ? level : "2";
			const Tag = `h${safe}` as const;
			const aligned = alignment(align, "start");
			return (
				<Tag
					className={cn("w-full", HEADINGS[safe], aligned.className)}
					style={aligned.style}
				>
					{text}
				</Tag>
			);
		},
	},
	RichText: {
		fields: {
			content: {
				type: "richtext",
				label: "Text",
				contentEditable: true,
				options: {
					heading: { levels: [2, 3] },
					textAlign: false,
					codeBlock: false,
					code: false,
				},
			},
		},
		render: ({ content }) => <div className={RICH_TEXT}>{content}</div>,
	},
	Image: {
		fields: {
			src: { type: "text", label: "Image URL" },
			alt: { type: "text", label: "Description (for screen readers)" },
			aspect: {
				type: "select",
				label: "Shape",
				options: [
					{ label: "Original", value: "auto" },
					{ label: "Square", value: "square" },
					{ label: "Wide", value: "wide" },
				],
			},
		},
		render: ({ src, alt, aspect }) => {
			const safe = imageSrc(src);
			const shape = known(ASPECTS, aspect, "auto");
			if (!safe)
				return (
					<div
						className={cn(
							"grid min-h-40 w-full place-content-center rounded-(--pb-radius) bg-muted text-muted-foreground text-sm",
							shape,
						)}
					>
						Image
					</div>
				);
			return (
				<img
					src={safe}
					alt={alt}
					loading="lazy"
					decoding="async"
					className={cn("w-full rounded-(--pb-radius) object-cover", shape)}
				/>
			);
		},
	},
	Button: {
		fields: {
			label: { type: "text", label: "Label", contentEditable: true },
			href: { type: "text", label: "Link" },
			variant: {
				type: "radio",
				label: "Style",
				options: [
					{ label: "Filled", value: "primary" },
					{ label: "Outline", value: "outline" },
				],
			},
			align: alignField("start"),
		},
		render: ({ label, href, variant, align, puck }) => {
			const target = resolveHref(
				href,
				builderMetadata(puck.metadata).organizationSlug,
			);
			const aligned = alignment(align, "start");
			return (
				<div className={aligned.className} style={aligned.style}>
					<a
						href={target ?? undefined}
						className={cn(
							buttonVariants({
								variant: variant === "outline" ? "outline" : "default",
								size: "lg",
							}),
							"rounded-(--pb-radius)",
							variant === "outline" && "text-foreground",
						)}
					>
						{label}
					</a>
				</div>
			);
		},
	},
	BookingWidget: {
		fields: {
			title: { type: "text", label: "Title", contentEditable: true },
			serviceIds: { type: "custom", render: () => <></> },
		},
		render: ({ title, serviceIds, puck }) => {
			const { services, organizationSlug } = builderMetadata(puck.metadata);
			return (
				<BookingWidget
					title={title}
					services={shownServices(services, serviceIds)}
					organizationSlug={organizationSlug}
				/>
			);
		},
	},
	FreeGrid: {
		fields: {
			items: { type: "slot" },
			layout: { type: "custom", render: () => <></> },
		},
		render: ({ items: Items, layout }) => (
			<Items as={FreeGridCells} layout={layout} />
		),
	},
};

/** What the storefront renders with; it must stay free of editor-only code. Fields are plain data, and `<Render>` needs the slot ones. */
export const renderConfig: BuilderConfig = {
	components: withVisibilityAll(blocks),
	root: {
		fields: {
			radius: {
				type: "select",
				label: "Corner roundness",
				options: [
					{ label: "Square", value: "none" },
					{ label: "Slight", value: "small" },
					{ label: "Rounded", value: "medium" },
					{ label: "Very rounded", value: "large" },
				],
			},
			spacing: {
				type: "select",
				label: "Spacing",
				options: [
					{ label: "Compact", value: "compact" },
					{ label: "Comfortable", value: "comfortable" },
					{ label: "Spacious", value: "spacious" },
				],
			},
		},
		render: ({ children, radius, spacing, puck }) => {
			const { branding } = builderMetadata(puck.metadata);
			const brand = branding ? brandAttributes(branding) : {};
			return (
				<div
					{...brand}
					style={{ ...brand.style, ...tokenStyle({ radius, spacing }) }}
					className="mx-auto grid w-full max-w-5xl gap-(--pb-space) font-sans text-foreground"
				>
					{children}
				</div>
			);
		},
	},
};
