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
	type CellMap,
	cellPlacement,
	type FreeGridLayout,
	gridStyle,
	resolveCells,
} from "./free-grid-layout";
import { builderMetadata, type ThemeTokens, tokenStyle } from "./theme-tokens";

export type HeadingLevel = "1" | "2" | "3";
type Tone = "plain" | "muted" | "brand";
type ColumnCount = "2" | "3" | "4";
type Align = "start" | "center";

export type BuilderComponents = {
	Section: { items: Slot; tone: Tone };
	Hero: { items: Slot; image: string; align: Align };
	ServicesSection: { items: Slot; tone: Tone };
	Columns: {
		count: ColumnCount;
		column1: Slot;
		column2: Slot;
		column3: Slot;
		column4: Slot;
	};
	Container: { items: Slot; width: "narrow" | "medium" | "full"; align: Align };
	Heading: { text: string; level: HeadingLevel; align: Align };
	RichText: { content: RichText };
	Image: { src: string; alt: string; aspect: "auto" | "square" | "wide" };
	Button: {
		label: string;
		href: string;
		variant: "primary" | "outline";
		align: Align;
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

/** Text alignment inherits, so it lines up the same with or without the editor's wrapper around each slot child. */
const ALIGN: Record<Align, string> = {
	start: "text-left",
	center: "text-center",
};

const COLUMNS: Record<ColumnCount, string> = {
	"2": "sm:grid-cols-2",
	"3": "sm:grid-cols-2 lg:grid-cols-3",
	"4": "sm:grid-cols-2 lg:grid-cols-4",
};

const WIDTHS = {
	narrow: "max-w-xl",
	medium: "max-w-3xl",
	full: "max-w-none",
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

/** Wraps each slot child (keyed by its id) in its grid cell. */
function FreeGridCells({
	layout,
	children,
	...rest
}: {
	layout: CellMap | undefined;
	children?: ReactNode;
	className?: string;
}) {
	const items = Children.toArray(children).filter(isValidElement);
	const ids = items.map((child) => String(child.key).replace(/^\.\$/, ""));
	const cells = resolveCells(ids, layout);
	return (
		<div {...rest} style={gridStyle}>
			{items.map((child, index) => {
				const cell = cells[index];
				return (
					<div key={child.key} style={cell && cellPlacement(cell)}>
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

const alignField = {
	type: "radio",
	label: "Alignment",
	options: [
		{ label: "Left", value: "start" },
		{ label: "Centre", value: "center" },
	],
} as const;

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
	},
	render: ({ items: Items, tone }) => (
		<section
			className={cn(
				"rounded-(--pb-radius) p-(--pb-space)",
				known(TONES, tone, "plain"),
			)}
		>
			<Items className={slotGrid} />
		</section>
	),
};

/** What the storefront renders with; it must stay free of editor-only code. Fields are plain data, and `<Render>` needs the slot ones. */
export const renderConfig: BuilderConfig = {
	components: {
		Section: section,
		ServicesSection: section,
		Hero: {
			fields: {
				items: { type: "slot" },
				image: { type: "text", label: "Background image URL" },
				align: alignField,
			},
			render: ({ items: Items, image, align }) => {
				const src = imageSrc(image);
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
								known(ALIGN, align, "center"),
							)}
						/>
					</section>
				);
			},
		},
		Columns: {
			fields: {
				count: {
					type: "radio",
					label: "Columns",
					options: [
						{ label: "2", value: "2" },
						{ label: "3", value: "3" },
						{ label: "4", value: "4" },
					],
				},
				column1: { type: "slot" },
				column2: { type: "slot" },
				column3: { type: "slot" },
				column4: { type: "slot" },
			},
			render: ({ count, column1, column2, column3, column4 }) => {
				const columns = [column1, column2, column3, column4].slice(
					0,
					Number(known({ "2": "2", "3": "3", "4": "4" }, count, "2")),
				);
				return (
					<div
						className={cn("grid gap-(--pb-space)", known(COLUMNS, count, "2"))}
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
				width: {
					type: "select",
					label: "Width",
					options: [
						{ label: "Narrow", value: "narrow" },
						{ label: "Medium", value: "medium" },
						{ label: "Full", value: "full" },
					],
				},
				align: alignField,
			},
			render: ({ items: Items, width, align }) => (
				<Items
					className={cn(
						slotGrid,
						"mx-auto w-full",
						known(WIDTHS, width, "medium"),
						known(ALIGN, align, "start"),
					)}
				/>
			),
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
				align: alignField,
			},
			render: ({ text, level, align }) => {
				const safe = level in HEADINGS ? level : "2";
				const Tag = `h${safe}` as const;
				return (
					<Tag
						className={cn(
							"w-full",
							HEADINGS[safe],
							align === "center" && "text-center",
						)}
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
				align: alignField,
			},
			render: ({ label, href, variant, align, puck }) => {
				const target = resolveHref(
					href,
					builderMetadata(puck.metadata).organizationSlug,
				);
				return (
					<div className={cn(align === "center" && "text-center")}>
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
				<Items as={FreeGridCells} layout={layout?.desktop} />
			),
		},
	},
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
