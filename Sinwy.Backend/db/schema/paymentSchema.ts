import { oneOf } from "@db/oneOf";
import { booking } from "@db/schema/bookingSchema";
import { organization } from "@db/schema/organizationSchema";
import { PAYMENT_PROVIDERS, PAYMENT_STATUSES } from "@sinwy/shared";
import { sql } from "drizzle-orm";
import {
	char,
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

/** One per priced booking; written in the same transaction as the booking change. */
export const payment = pgTable(
	"payment",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		bookingId: text("booking_id")
			.notNull()
			.references(() => booking.id, { onDelete: "cascade" }),
		amountMinor: integer("amount_minor").notNull(),
		currency: char("currency", { length: 3 }).notNull(),
		status: text("status").notNull(),
		provider: text("provider").notNull(),
		providerRef: text("provider_ref"),
		paidAt: timestamp("paid_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("payment_booking_id_idx").on(table.bookingId),
		index("payment_organization_created_at_idx").on(
			table.organizationId,
			table.createdAt,
		),
		uniqueIndex("payment_provider_ref_idx").on(
			table.provider,
			table.providerRef,
		),
		check("payment_status_check", oneOf("status", PAYMENT_STATUSES)),
		check("payment_provider_check", oneOf("provider", PAYMENT_PROVIDERS)),
		check("payment_amount_check", sql`${table.amountMinor} >= 0`),
		check(
			"payment_paid_at_check",
			sql`(${table.paidAt} IS NOT NULL) = (${table.status} = 'paid')`,
		),
	],
);
