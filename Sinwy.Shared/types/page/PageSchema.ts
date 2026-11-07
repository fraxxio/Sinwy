import { z } from "zod";
import { PAGE_LIMITS as LIMITS, RESERVED_PAGE_SLUGS } from "./Page";
import { pageContentSchema } from "./PageContent";
import { PAGE_TEMPLATE_IDS } from "./PageTemplates";

const reserved: readonly string[] = RESERVED_PAGE_SLUGS;

export const pageSlugSchema = z
	.string()
	.trim()
	.min(1, "Address is required")
	.max(LIMITS.slug, `Max ${LIMITS.slug} characters`)
	.regex(
		/^[a-z0-9]+(-[a-z0-9]+)*$/,
		"Use lowercase letters, digits and single hyphens between them",
	)
	.refine((slug) => !reserved.includes(slug), "This address is reserved");

const pageTitleSchema = z
	.string()
	.trim()
	.min(1, "Title is required")
	.max(LIMITS.title, `Max ${LIMITS.title} characters`);

export const createPageSchema = z.object({
	templateId: z.enum(PAGE_TEMPLATE_IDS, "Pick a template"),
	title: pageTitleSchema,
	slug: pageSlugSchema,
});

export type CreatePageInput = z.infer<typeof createPageSchema>;

/** Empty SEO fields fall back to the page title and the organization tagline; the API stores them as null. */
export const pageDetailsSchema = z.object({
	title: pageTitleSchema,
	slug: pageSlugSchema,
	seoTitle: z
		.string()
		.trim()
		.max(LIMITS.seoTitle, `Max ${LIMITS.seoTitle} characters`),
	seoDescription: z
		.string()
		.trim()
		.max(LIMITS.seoDescription, `Max ${LIMITS.seoDescription} characters`),
});

export type PageDetailsInput = z.infer<typeof pageDetailsSchema>;

export const updatePageSchema = pageDetailsSchema.partial();

export type UpdatePageInput = z.infer<typeof updatePageSchema>;

export const savePageContentSchema = z.object({
	/** The version the edit started from; a newer one means another save got there first. */
	baseVersion: z.number().int().min(1),
	content: pageContentSchema,
});

export type SavePageContentInput = z.infer<typeof savePageContentSchema>;
