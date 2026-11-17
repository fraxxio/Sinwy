import {
	imageSrc,
	type PageContent,
	type PageWidget,
	type PublicServiceDto,
	resolveHref,
} from "@sinwy/shared";
import type { ReactNode } from "react";
import { Img } from "#/shared/components/Img";
import { PuckPage } from "#/shared/components/page-builder/PuckPage";
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

const HEADINGS = {
	1: "text-3xl font-heading font-semibold tracking-tight sm:text-4xl",
	2: "text-2xl font-heading font-semibold tracking-tight",
	3: "text-xl font-heading font-medium",
} as const;

function Widget({
	widget,
	organizationSlug,
}: {
	widget: PageWidget;
	organizationSlug: string;
}): ReactNode {
	const { props } = widget;
	switch (widget.type) {
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

function Widgets({
	widgets,
	organizationSlug,
}: {
	widgets: PageWidget[];
	organizationSlug: string;
}) {
	return widgets.map((widget) => (
		<div key={widget.id} data-widget={widget.type} className="contents">
			<Widget widget={widget} organizationSlug={organizationSlug} />
			{widget.children && (
				<div className="grid gap-4">
					<Widgets
						widgets={widget.children}
						organizationSlug={organizationSlug}
					/>
				</div>
			)}
		</div>
	));
}

/** Version 1 is the MVP widget tree, where unknown widget types are skipped; version 2 is a Puck document. */
export function PageRenderer({
	content,
	organizationSlug,
	services = [],
}: {
	content: PageContent;
	organizationSlug: string;
	/** Shown by the page builder's booking widget. */
	services?: PublicServiceDto[] | undefined;
}) {
	if (content.schemaVersion === 2)
		return (
			<PuckPage data={content.data} metadata={{ organizationSlug, services }} />
		);
	return (
		<article className="grid gap-6">
			<Widgets widgets={content.widgets} organizationSlug={organizationSlug} />
		</article>
	);
}
