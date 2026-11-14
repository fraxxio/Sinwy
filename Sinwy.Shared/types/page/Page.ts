import type { OrganizationBrandingDto } from "../organization/OrganizationBranding";
import type { PageContent } from "./PageContent";

export const PAGE_STATUSES = ["draft", "published"] as const;

export type PageStatus = (typeof PAGE_STATUSES)[number];

export const PAGE_LIMITS = {
	title: 100,
	slug: 60,
	seoTitle: 70,
	seoDescription: 160,
} as const;

/** Static routes under `/<orgSlug>/` that a page can't take. */
export const RESERVED_PAGE_SLUGS = ["book", "s"] as const;

export type PageUsageDto = { used: number; limit: number };

export type PageListItemDto = {
	id: string;
	title: string;
	slug: string;
	status: PageStatus;
	/** Published and inside the plan's served set, so the public URL answers. */
	live: boolean;
	updatedAt: string;
	publishedAt: string | null;
};

export type PageListDto = {
	items: PageListItemDto[];
	usage: PageUsageDto;
};

export type PageVersionDto = {
	version: number;
	content: PageContent;
	createdAt: string;
};

export type PageDetailDto = PageListItemDto & {
	seoTitle: string | null;
	seoDescription: string | null;
	createdAt: string;
	latestVersion: PageVersionDto;
	publishedVersion: number | null;
	hasUnpublishedChanges: boolean;
};

/** What anyone can read of a live page; never the draft. */
export type PublicPageDto = {
	organization: {
		name: string;
		slug: string;
		branding: OrganizationBrandingDto;
	};
	title: string;
	/** Already resolved: falls back to the page title and the organization tagline. */
	seoTitle: string;
	seoDescription: string | null;
	content: PageContent;
};
