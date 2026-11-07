import type { PageBlock, PageContent } from "@sinwy/shared";
import type { ReactNode } from "react";
import { Img } from "#/shared/components/Img";
import { Button } from "#/shared/components/ui/button";

type Props = Record<string, unknown>;

const str = (props: Props, key: string) => {
	const value = props[key];
	return typeof value === "string" && value.trim() ? value : null;
};

const list = (props: Props, key: string): Props[] => {
	const value = props[key];
	return Array.isArray(value)
		? value.filter(
				(item): item is Props => typeof item === "object" && item !== null,
			)
		: [];
};

const SAFE_URL = /^(https?:|mailto:|tel:|\/|#)/i;

/** Absolute and root links pass through; a bare path like "book" is under the organization. */
const resolveHref = (href: string | null, organizationSlug: string) => {
	if (!href) return null;
	if (SAFE_URL.test(href)) return href;
	if (/^[a-z0-9-]+(\/[\w-]*)*$/i.test(href))
		return `/${organizationSlug}/${href}`;
	return null;
};

const imageSrc = (src: string | null) =>
	src && /^(https?:|\/)/i.test(src) ? src : null;

const HEADINGS = {
	1: "text-3xl font-heading font-semibold tracking-tight sm:text-4xl",
	2: "text-2xl font-heading font-semibold tracking-tight",
	3: "text-xl font-heading font-medium",
} as const;

function Block({
	block,
	organizationSlug,
}: {
	block: PageBlock;
	organizationSlug: string;
}): ReactNode {
	const { props } = block;
	switch (block.type) {
		case "heading": {
			const text = str(props, "text");
			if (!text) return null;
			const { level: asked } = props;
			const level = asked === 1 || asked === 3 ? asked : 2;
			const Tag = `h${level}` as const;
			return <Tag className={HEADINGS[level]}>{text}</Tag>;
		}
		case "text": {
			const text = str(props, "text");
			return text ? (
				<p className="whitespace-pre-line text-muted-foreground leading-relaxed">
					{text}
				</p>
			) : null;
		}
		case "image": {
			const src = imageSrc(str(props, "src"));
			return src ? (
				<Img
					src={src}
					alt={str(props, "alt") ?? ""}
					className="w-full rounded-xl object-cover"
				/>
			) : null;
		}
		case "button": {
			const label = str(props, "label");
			const href = resolveHref(str(props, "href"), organizationSlug);
			return label && href ? (
				<Button
					className="w-fit"
					nativeButton={false}
					render={<a href={href}>{label}</a>}
				/>
			) : null;
		}
		case "gallery": {
			const images = list(props, "images").flatMap((image, position) => {
				const src = imageSrc(str(image, "src"));
				return src ? [{ position, src, alt: str(image, "alt") ?? "" }] : [];
			});
			return images.length ? (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{images.map((image) => (
						<Img
							key={image.position}
							src={image.src}
							alt={image.alt}
							className="aspect-square w-full rounded-lg object-cover"
						/>
					))}
				</div>
			) : null;
		}
		case "testimonials": {
			const items = list(props, "items").flatMap((item, position) => {
				const quote = str(item, "quote");
				return quote ? [{ position, quote, author: str(item, "author") }] : [];
			});
			return items.length ? (
				<div className="grid gap-4 sm:grid-cols-2">
					{items.map((item) => (
						<figure key={item.position} className="rounded-xl border p-4">
							<blockquote className="text-sm">“{item.quote}”</blockquote>
							{item.author && (
								<figcaption className="mt-2 text-muted-foreground text-sm">
									{item.author}
								</figcaption>
							)}
						</figure>
					))}
				</div>
			) : null;
		}
		default:
			return null;
	}
}

function Blocks({
	blocks,
	organizationSlug,
}: {
	blocks: PageBlock[];
	organizationSlug: string;
}) {
	return blocks.map((block) => (
		<div key={block.id} data-block={block.type} className="contents">
			<Block block={block} organizationSlug={organizationSlug} />
			{block.children && (
				<div className="grid gap-4">
					<Blocks blocks={block.children} organizationSlug={organizationSlug} />
				</div>
			)}
		</div>
	));
}

/** The MVP rendering of a content tree; unknown block types are skipped. */
export function PageRenderer({
	content,
	organizationSlug,
}: {
	content: PageContent;
	organizationSlug: string;
}) {
	return (
		<article className="grid gap-6">
			<Blocks blocks={content.blocks} organizationSlug={organizationSlug} />
		</article>
	);
}
