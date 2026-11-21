import type { Metadata, PuckContext, SlotComponent } from "@puckeditor/core";
import type {
	BLOCKS,
	BlockType,
	OrganizationBrandingDto,
	PublicServiceDto,
	RichTextField,
	SlotField,
} from "@sinwy/shared";
import type { ReactNode } from "react";
import { buttonVariants } from "#/shared/components/ui/button";
import { brandAttributes } from "#/shared/lib/branding";
import { formatMinorUnits } from "#/shared/lib/money";
import { cn } from "#/shared/lib/utils";
import { imageSrc, resolveHref } from "./urls";

/** What a page renders with besides its document, passed to Puck as `metadata`. */
export type PageMetadata = {
	organizationSlug: string;
	services: PublicServiceDto[];
	branding: OrganizationBrandingDto | null;
};

export const pageMetadata = ({
	organizationSlug,
	services,
	branding,
}: Metadata): PageMetadata => ({
	organizationSlug:
		typeof organizationSlug === "string" ? organizationSlug : "",
	services: Array.isArray(services) ? services : [],
	branding: branding ?? null,
});

/** The page around its blocks, in the organization's branding; the editor's canvas uses it too. */
export function PageFrame({
	metadata,
	className,
	children,
}: {
	metadata: Metadata;
	className?: string;
	children: ReactNode;
}) {
	const { branding } = pageMetadata(metadata);
	return (
		<div
			{...(branding && brandAttributes(branding))}
			className={cn("mx-auto grid w-full max-w-5xl gap-8", className)}
		>
			{children}
		</div>
	);
}

type RenderValue<F> = F extends SlotField
	? SlotComponent
	: F extends RichTextField
		? ReactNode
		: F extends { default: infer V }
			? V
			: never;

/** A block's props as its render gets them: every value present and valid, slots as components, rich text as elements. */
export type RenderProps<T extends BlockType> = {
	[K in keyof (typeof BLOCKS)[T]["fields"]]: RenderValue<
		(typeof BLOCKS)[T]["fields"][K]
	>;
} & { id: string; puck: PuckContext };

const SLOT = "grid content-start gap-4";

const TONES = {
	plain: "",
	muted: "bg-muted",
	brand: "bg-primary text-primary-foreground",
};

const PADDINGS = {
	none: "",
	small: "p-4",
	medium: "p-6 sm:p-8",
	large: "p-8 sm:p-14",
};

const COLUMNS = {
	"2": "sm:grid-cols-2",
	"3": "sm:grid-cols-2 lg:grid-cols-3",
	"4": "sm:grid-cols-2 lg:grid-cols-4",
};

/** Up to four photos share a row, then the row wraps; `--gap` is the space between them. */
const PHOTO_ROW =
	"grid gap-(--gap) [grid-template-columns:repeat(auto-fit,minmax(calc((100%_-_3*var(--gap))/4),1fr))]";

const PHOTO_GAPS = {
	none: "[--gap:0px]",
	small: "[--gap:--spacing(2)]",
	medium: "[--gap:--spacing(4)]",
	large: "[--gap:--spacing(8)]",
};

const PHOTO_PHONE_LAYOUTS = { row: "", stack: "max-sm:grid-cols-1" };

const HEADINGS = {
	"1": "text-3xl font-heading font-semibold tracking-tight text-balance sm:text-5xl",
	"2": "text-2xl font-heading font-semibold tracking-tight text-balance sm:text-3xl",
	"3": "text-xl font-heading font-medium",
};

const ASPECTS = {
	auto: "",
	square: "aspect-square",
	wide: "aspect-video",
};

/** Text alignment inherits, so it lines up the same inside the editor's wrapper around each slot child; `start` follows the parent. */
const ALIGN = { start: "", center: "text-center" };

const RICH_TEXT =
	"text-pretty leading-relaxed [&_:is(p,ul,ol,h2,h3,blockquote):not(:first-child)]:mt-3 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:font-heading [&_h2]:font-semibold [&_h2]:text-2xl [&_h3]:font-heading [&_h3]:font-medium [&_h3]:text-xl [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6";

const shownServices = (services: PublicServiceDto[], ids: string[]) =>
	ids.length > 0
		? ids.flatMap((id) => services.filter((service) => service.id === id))
		: services;

function ServiceList({
	services,
	organizationSlug,
}: {
	services: PublicServiceDto[];
	organizationSlug: string;
}) {
	return (
		<ul className="divide-y overflow-hidden rounded-xl border bg-card text-left text-card-foreground">
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
						className={buttonVariants({ size: "sm" })}
					>
						Book
					</a>
				</li>
			))}
		</ul>
	);
}

function Placeholder({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"grid min-h-24 place-content-center rounded-xl border border-dashed p-4 text-muted-foreground text-sm",
				className,
			)}
		>
			{children}
		</div>
	);
}

export const BLOCK_RENDERS: {
	[T in BlockType]: (props: RenderProps<T>) => ReactNode;
} = {
	Section: ({ items: Items, tone, padding }) => (
		<section className={cn("rounded-xl", TONES[tone], PADDINGS[padding])}>
			<Items className={SLOT} />
		</section>
	),

	Columns: ({ count, column1, column2, column3, column4 }) => (
		<div className={cn("grid gap-4", COLUMNS[count])}>
			{[column1, column2, column3, column4]
				.slice(0, Number(count))
				.map((Column, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed positions
					<Column key={index} className={cn(SLOT, "min-h-16")} />
				))}
		</div>
	),

	Heading: ({ text, size, align }) => {
		const Tag = `h${size}` as const;
		return <Tag className={cn(HEADINGS[size], ALIGN[align])}>{text}</Tag>;
	},

	RichText: ({ content }) => <div className={RICH_TEXT}>{content}</div>,

	Image: ({ src, alt, aspect, puck }) => {
		const safe = imageSrc(src);
		if (!safe)
			return puck.isEditing ? (
				<Placeholder className={ASPECTS[aspect]}>Image</Placeholder>
			) : null;
		return (
			<img
				src={safe}
				alt={alt}
				loading="lazy"
				decoding="async"
				className={cn("w-full rounded-xl object-cover", ASPECTS[aspect])}
			/>
		);
	},

	Button: ({ label, href, variant, align, puck }) => (
		<div className={ALIGN[align]}>
			<a
				href={
					resolveHref(href, pageMetadata(puck.metadata).organizationSlug) ??
					undefined
				}
				className={cn(
					buttonVariants({
						variant: variant === "outline" ? "outline" : "default",
						size: "lg",
					}),
					variant === "outline" && "text-foreground",
				)}
			>
				{label}
			</a>
		</div>
	),

	Photos: ({ items: Items, gap, phoneLayout }) => (
		<Items
			className={cn(
				PHOTO_ROW,
				PHOTO_GAPS[gap],
				PHOTO_PHONE_LAYOUTS[phoneLayout],
			)}
		/>
	),

	Hero: ({ items: Items, image, align }) => {
		const src = imageSrc(image);
		return (
			<section
				className={cn(
					"relative isolate overflow-hidden rounded-xl px-6 py-16 sm:py-24",
					src ? "text-white" : "bg-primary text-primary-foreground",
				)}
			>
				{src && (
					<>
						<img
							src={src}
							alt=""
							className="absolute inset-0 -z-20 size-full object-cover"
						/>
						<div className="absolute inset-0 -z-10 bg-black/50" />
					</>
				)}
				<Items className={cn(SLOT, "mx-auto max-w-2xl", ALIGN[align])} />
			</section>
		);
	},

	Services: ({ title, intro, serviceIds, puck }) => {
		const { services, organizationSlug } = pageMetadata(puck.metadata);
		const shown = shownServices(services, serviceIds);
		return (
			<section className="grid gap-4">
				{title && <h2 className={HEADINGS["2"]}>{title}</h2>}
				{intro && <div className={RICH_TEXT}>{intro}</div>}
				{shown.length > 0 ? (
					<ServiceList services={shown} organizationSlug={organizationSlug} />
				) : (
					puck.isEditing && <Placeholder>No services to show yet.</Placeholder>
				)}
			</section>
		);
	},

	Booking: ({ title, intro, serviceIds, puck }) => {
		const { services, organizationSlug } = pageMetadata(puck.metadata);
		const shown = shownServices(services, serviceIds);
		return (
			<section className="grid gap-4 rounded-xl bg-muted p-6 sm:p-8">
				{title && <h2 className={HEADINGS["2"]}>{title}</h2>}
				{intro && <div className={RICH_TEXT}>{intro}</div>}
				{shown.length > 0 ? (
					<ServiceList services={shown} organizationSlug={organizationSlug} />
				) : (
					puck.isEditing && <Placeholder>No services to show yet.</Placeholder>
				)}
				<div>
					<a
						href={`/${organizationSlug}/book`}
						className={buttonVariants({ size: "lg" })}
					>
						Book now
					</a>
				</div>
			</section>
		);
	},
};
