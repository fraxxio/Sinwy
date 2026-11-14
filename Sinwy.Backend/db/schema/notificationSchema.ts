import { jsonb } from "@db/jsonb";
import { member } from "@db/schema/organizationSchema";
import { user } from "@db/schema/userSchema";
import type { NotificationContent } from "@sinwy/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per recipient. Organization notifications belong to the recipient's
 * membership, so leaving or being removed takes them along; personal ones have
 * neither organization nor member.
 */
export const notification = pgTable(
	"notification",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// no foreign key: the member's cascade already removes the row with the organization
		organizationId: text("organization_id"),
		memberId: text("member_id").references(() => member.id, {
			onDelete: "cascade",
		}),
		type: text("type").$type<NotificationContent["type"]>().notNull(),
		payload: jsonb<NotificationContent["payload"]>("payload").notNull(),
		link: text("link"),
		readAt: timestamp("read_at"),
		// set in JS, so the millisecond cursor matches the stored value exactly
		createdAt: timestamp("created_at")
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [
		// ids are UUIDv7, so newest first is id order
		index("notification_inbox_idx").on(
			table.userId,
			table.organizationId,
			table.id,
		),
		index("notification_unread_idx")
			.on(table.userId, table.organizationId)
			.where(sql`${table.readAt} is null`),
		index("notification_created_idx").on(table.createdAt),
		index("notification_member_idx").on(table.memberId),
		check(
			"notification_member_has_organization",
			sql`(${table.organizationId} is null) = (${table.memberId} is null)`,
		),
	],
);
