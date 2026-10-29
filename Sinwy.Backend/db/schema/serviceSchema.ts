import { organization } from "@db/schema/organizationSchema";
import { sql } from "drizzle-orm";
import {
	boolean,
	char,
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const service = pgTable(
	"service",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		durationMinutes: integer("duration_minutes").notNull(),
		// smallest currency unit; copied with the currency so prices never change meaning
		priceMinor: integer("price_minor").notNull(),
		currency: char("currency", { length: 3 }).notNull(),
		capacity: integer("capacity").notNull().default(1),
		bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
		bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
		isActive: boolean("is_active").notNull().default(true),
		// archived rather than deleted, so bookings keep a service to point at
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("service_organizationId_idx").on(table.organizationId),
		uniqueIndex("service_organization_slug_uidx")
			.on(table.organizationId, table.slug)
			.where(sql`${table.archivedAt} IS NULL`),
		check(
			"service_duration_check",
			sql`${table.durationMinutes} BETWEEN 5 AND 720`,
		),
		check("service_price_check", sql`${table.priceMinor} >= 0`),
		check(
			"service_buffers_check",
			sql`${table.bufferBeforeMinutes} BETWEEN 0 AND 240 AND ${table.bufferAfterMinutes} BETWEEN 0 AND 240`,
		),
		check("service_capacity_check", sql`${table.capacity} >= 1`),
	],
);
