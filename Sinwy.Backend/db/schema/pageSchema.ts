import { jsonb } from "@db/jsonb";
import { oneOf } from "@db/oneOf";
import { organization } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import { PAGE_STATUSES, type PageContent } from "@sinwy/shared";
import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const page = pgTable(
	"page",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		title: text("title").notNull(),
		status: text("status").notNull().default("draft"),
		seoTitle: text("seo_title"),
		seoDescription: text("seo_description"),
		// the live version; later saves stay drafts until the next publish
		publishedVersionId: text("published_version_id").references(
			(): AnyPgColumn => pageContent.id,
			{ onDelete: "set null" },
		),
		publishedAt: timestamp("published_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("page_organization_slug_uidx").on(
			table.organizationId,
			table.slug,
		),
		// the served set: a plan's limit counts pages oldest first
		index("page_organization_created_idx").on(
			table.organizationId,
			table.createdAt,
			table.id,
		),
		check("page_status_check", oneOf("status", PAGE_STATUSES)),
	],
);

/** Every content save is a new numbered version; old ones are kept. */
export const pageContent = pgTable(
	"page_content",
	{
		id: text("id").primaryKey(),
		pageId: text("page_id")
			.notNull()
			.references(() => page.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		content: jsonb<PageContent>("content").notNull(),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("page_content_page_version_uidx").on(
			table.pageId,
			table.version,
		),
		check("page_content_version_check", sql`${table.version} >= 1`),
	],
);
