import { oneOf } from "@db/oneOf";
import { organization } from "@db/schema/organizationSchema";
import { AVAILABILITY_EXCEPTION_KINDS } from "@sinwy/shared";
import { sql } from "drizzle-orm";
import {
	boolean,
	char,
	check,
	date,
	index,
	integer,
	pgTable,
	smallint,
	text,
	time,
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

/** Weekly opening hours as local wall-clock times; a null service means the whole organization. */
export const serviceAvailability = pgTable(
	"service_availability",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		serviceId: text("service_id").references(() => service.id, {
			onDelete: "cascade",
		}),
		// ISO weekday, 1 = Monday
		weekday: smallint("weekday").notNull(),
		startTime: time("start_time").notNull(),
		endTime: time("end_time").notNull(),
	},
	(table) => [
		index("service_availability_organization_service_idx").on(
			table.organizationId,
			table.serviceId,
		),
		check(
			"service_availability_weekday_check",
			sql`${table.weekday} BETWEEN 1 AND 7`,
		),
		check(
			"service_availability_range_check",
			sql`${table.startTime} < ${table.endTime}`,
		),
	],
);

/** A date that departs from the weekly hours; null times cover the whole day. */
export const availabilityException = pgTable(
	"availability_exception",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		serviceId: text("service_id").references(() => service.id, {
			onDelete: "cascade",
		}),
		date: date("date").notNull(),
		kind: text("kind").notNull(),
		startTime: time("start_time"),
		endTime: time("end_time"),
		note: text("note"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("availability_exception_organization_date_idx").on(
			table.organizationId,
			table.date,
		),
		uniqueIndex("availability_exception_org_closed_day_uidx")
			.on(table.organizationId, table.date)
			.where(
				sql`${table.serviceId} IS NULL AND ${table.kind} = 'closed' AND ${table.startTime} IS NULL`,
			),
		check(
			"availability_exception_kind_check",
			oneOf("kind", AVAILABILITY_EXCEPTION_KINDS),
		),
		check(
			"availability_exception_range_check",
			sql`(${table.startTime} IS NULL AND ${table.endTime} IS NULL) OR ${table.startTime} < ${table.endTime}`,
		),
	],
);
