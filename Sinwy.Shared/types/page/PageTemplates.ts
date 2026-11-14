import { COUNTRY_OPTIONS, type OrganizationProfileDto } from "../organization";
import type { Feature } from "../plan";
import type { PageContent, PageWidget, WidgetType } from "./PageContent";

export type PageTemplateDefinition = {
	label: string;
	description: string;
	requires?: Feature;
	/** Builds a page's first version, prefilled from whatever the profile has. */
	build: (profile: OrganizationProfileDto) => PageContent;
};

const widgetsFrom = (
	parts: (Omit<PageWidget, "id"> | null | false)[],
): PageWidget[] => {
	const counts = new Map<WidgetType, number>();
	return parts
		.filter((part) => !!part)
		.map((part) => {
			const n = (counts.get(part.type) ?? 0) + 1;
			counts.set(part.type, n);
			return { id: `${part.type}-${n}`, ...part };
		});
};

const content = (
	...parts: (Omit<PageWidget, "id"> | null | false)[]
): PageContent => ({ schemaVersion: 1, widgets: widgetsFrom(parts) });

const heading = (text: string, level: 1 | 2 | 3 = 2) => ({
	type: "heading" as const,
	props: { text, level },
});

const text = (value: string | null) =>
	value ? { type: "text" as const, props: { text: value } } : null;

const button = (label: string, href: string) => ({
	type: "button" as const,
	props: { label, href },
});

const location = (profile: OrganizationProfileDto) => {
	const country = COUNTRY_OPTIONS.find(
		(option) => option.value === profile.country,
	)?.label;
	return [profile.city, country].filter(Boolean).join(", ") || null;
};

const contactLines = (profile: OrganizationProfileDto) =>
	[
		location(profile),
		profile.email && `Email: ${profile.email}`,
		profile.phone && `Phone: ${profile.phone}`,
		profile.website && `Website: ${profile.website}`,
	]
		.filter(Boolean)
		.join("\n") || null;

const pageTemplates = {
	blank: {
		label: "Blank",
		description: "An empty page to fill in yourself.",
		build: () => content(),
	},
	about: {
		label: "About",
		description: "Who you are, where to find you and how to get in touch.",
		build: (profile) => {
			const contact = contactLines(profile);
			return content(
				heading("About us", 1),
				text(profile.tagline),
				text(profile.description),
				contact !== null && heading("Get in touch"),
				text(contact),
			);
		},
	},
	landing: {
		label: "Landing",
		description: "A headline, a gallery, reviews and a call to book.",
		requires: "advanced-widgets",
		build: (profile) =>
			content(
				heading(profile.tagline ?? "Welcome", 1),
				text(profile.description),
				button("Book now", "book"),
				{ type: "gallery", props: { images: [] } },
				heading("What our clients say"),
				{ type: "testimonials", props: { items: [] } },
			),
	},
	"services-showcase": {
		label: "Services showcase",
		description: "Your services with pictures and a booking button.",
		requires: "advanced-widgets",
		build: (profile) =>
			content(
				heading("Our services", 1),
				text(profile.tagline),
				{ type: "gallery", props: { images: [] } },
				text(location(profile)),
				button("See times and book", "book"),
			),
	},
} satisfies Record<string, PageTemplateDefinition>;

export type PageTemplateId = keyof typeof pageTemplates;

export const PAGE_TEMPLATES: Record<PageTemplateId, PageTemplateDefinition> =
	pageTemplates;

export const PAGE_TEMPLATE_IDS = Object.keys(pageTemplates) as [
	PageTemplateId,
	...PageTemplateId[],
];
