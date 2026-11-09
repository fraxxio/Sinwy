import { oneOf } from "@db/oneOf";
import { organization } from "@db/schema/organizationSchema";
import { page } from "@db/schema/pageSchema";
import {
	ANALYTICS_DAILY_METRICS,
	ANALYTICS_EVENT_KINDS,
	DEVICE_TYPES,
} from "@sinwy/shared";
import {
	check,
	date,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

/** Raw events of days not rolled up yet. Never holds an IP or a user agent. */
export const analyticsEvent = pgTable(
	"analytics_event",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// null is the booking page
		pageId: text("page_id").references(() => page.id, {
			onDelete: "cascade",
		}),
		kind: text("kind").notNull(),
		localDate: date("local_date").notNull(),
		visitorHash: text("visitor_hash").notNull(),
		referrerHost: text("referrer_host"),
		device: text("device").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("analytics_event_organization_date_idx").on(
			table.organizationId,
			table.localDate,
		),
		check("analytics_event_kind_check", oneOf("kind", ANALYTICS_EVENT_KINDS)),
		check("analytics_event_device_check", oneOf("device", DEVICE_TYPES)),
	],
);

/** One random salt per local date, so visitor hashes can't be linked across days. */
export const analyticsSalt = pgTable("analytics_salt", {
	localDate: date("local_date").primaryKey(),
	salt: text("salt").notNull(),
});

/** Site-wide daily counts; `key` is the referrer host ('' for direct) or the device. */
export const analyticsDaily = pgTable(
	"analytics_daily",
	{
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		localDate: date("local_date").notNull(),
		metric: text("metric").notNull(),
		key: text("key").notNull().default(""),
		events: integer("events").notNull(),
		visitors: integer("visitors").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.organizationId, table.localDate, table.metric, table.key],
		}),
		check(
			"analytics_daily_metric_check",
			oneOf("metric", ANALYTICS_DAILY_METRICS),
		),
	],
);

/** Daily views per page; a null page is the booking page. */
export const analyticsPageDaily = pgTable(
	"analytics_page_daily",
	{
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		localDate: date("local_date").notNull(),
		pageId: text("page_id").references(() => page.id, {
			onDelete: "cascade",
		}),
		views: integer("views").notNull(),
		visitors: integer("visitors").notNull(),
	},
	(table) => [
		unique("analytics_page_daily_organization_date_page_unique")
			.on(table.organizationId, table.localDate, table.pageId)
			.nullsNotDistinct(),
	],
);
