import { oneOf } from "@db/oneOf";
import { organization } from "@db/schema/organizationSchema";
import { service } from "@db/schema/serviceSchema";
import { user } from "@db/schema/userSchema";
import {
	BOOKING_CANCELLERS,
	BOOKING_EVENT_ACTOR_TYPES,
	BOOKING_EVENT_TYPES,
	BOOKING_STATUSES,
} from "@sinwy/shared";
import { sql } from "drizzle-orm";
import {
	char,
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const booking = pgTable(
	"booking",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		serviceId: text("service_id")
			.notNull()
			.references(() => service.id, { onDelete: "restrict" }),
		// null for manual bookings, and once the customer deletes their account
		customerUserId: text("customer_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		customerName: text("customer_name").notNull(),
		customerEmail: text("customer_email"),
		customerPhone: text("customer_phone"),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
		// copied from the service, so later edits don't move or reprice the booking
		bufferBeforeMinutes: integer("buffer_before_minutes").notNull(),
		bufferAfterMinutes: integer("buffer_after_minutes").notNull(),
		cancellationWindowMinutes: integer("cancellation_window_minutes")
			.notNull()
			.default(0),
		priceMinor: integer("price_minor").notNull(),
		currency: char("currency", { length: 3 }).notNull(),
		status: text("status").notNull(),
		cancelledBy: text("cancelled_by"),
		cancellationReason: text("cancellation_reason"),
		customerNote: text("customer_note"),
		internalNote: text("internal_note"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("booking_organization_starts_at_idx").on(
			table.organizationId,
			table.startsAt,
		),
		index("booking_customer_starts_at_idx").on(
			table.customerUserId,
			table.startsAt,
		),
		check("booking_status_check", oneOf("status", BOOKING_STATUSES)),
		check(
			"booking_cancelled_by_check",
			oneOf("cancelled_by", BOOKING_CANCELLERS),
		),
		check(
			"booking_cancelled_check",
			sql`(${table.cancelledBy} IS NOT NULL) = (${table.status} = 'cancelled')`,
		),
		check("booking_range_check", sql`${table.startsAt} < ${table.endsAt}`),
		check(
			"booking_contact_check",
			sql`${table.customerEmail} IS NOT NULL OR ${table.customerPhone} IS NOT NULL OR ${table.customerUserId} IS NOT NULL`,
		),
		check("booking_price_check", sql`${table.priceMinor} >= 0`),
		check(
			"booking_buffers_check",
			sql`${table.bufferBeforeMinutes} >= 0 AND ${table.bufferAfterMinutes} >= 0`,
		),
		check(
			"booking_cancellation_window_check",
			sql`${table.cancellationWindowMinutes} >= 0`,
		),
	],
);

/** A booking's history; written in the same transaction as the change it records. */
export const bookingEvent = pgTable(
	"booking_event",
	{
		id: text("id").primaryKey(),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		fromStatus: text("from_status"),
		toStatus: text("to_status"),
		actorType: text("actor_type").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		// old and new times, or the changed field names
		payload: jsonb("payload")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		occurredAt: timestamp("occurred_at").notNull().defaultNow(),
	},
	(table) => [
		index("booking_event_booking_occurred_at_idx").on(
			table.bookingId,
			table.occurredAt,
		),
		check("booking_event_type_check", oneOf("type", BOOKING_EVENT_TYPES)),
		check(
			"booking_event_from_status_check",
			oneOf("from_status", BOOKING_STATUSES),
		),
		check(
			"booking_event_to_status_check",
			oneOf("to_status", BOOKING_STATUSES),
		),
		check(
			"booking_event_actor_type_check",
			oneOf("actor_type", BOOKING_EVENT_ACTOR_TYPES),
		),
	],
);
