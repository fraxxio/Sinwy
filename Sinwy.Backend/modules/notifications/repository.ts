import db from "@db";
import { notification } from "@db/schema/notificationSchema";
import { user } from "@db/schema/userSchema";
import { and, count, desc, eq, isNull, lt } from "drizzle-orm";

/** The organization's inbox, or the personal one when null. */
const inbox = (userId: string, organizationId: string | null) =>
	and(
		eq(notification.userId, userId),
		organizationId === null
			? isNull(notification.organizationId)
			: eq(notification.organizationId, organizationId),
	);

export const insertNotifications = async (
	rows: (typeof notification.$inferInsert)[],
) => {
	if (rows.length > 0) await db.insert(notification).values(rows);
};

export const findNotifications = (
	userId: string,
	organizationId: string | null,
	beforeId: string | null,
	limit: number,
) =>
	db
		.select({
			id: notification.id,
			type: notification.type,
			payload: notification.payload,
			link: notification.link,
			readAt: notification.readAt,
			createdAt: notification.createdAt,
		})
		.from(notification)
		.where(
			and(
				inbox(userId, organizationId),
				beforeId ? lt(notification.id, beforeId) : undefined,
			),
		)
		.orderBy(desc(notification.id))
		.limit(limit);

export const countUnread = async (
	userId: string,
	organizationId: string | null,
) => {
	const [row] = await db
		.select({ count: count() })
		.from(notification)
		.where(and(inbox(userId, organizationId), isNull(notification.readAt)));
	return row?.count ?? 0;
};

/** False when the user has no such unread notification. */
export const markRead = async (userId: string, id: string, at: Date) =>
	(
		await db
			.update(notification)
			.set({ readAt: at })
			.where(
				and(
					eq(notification.id, id),
					eq(notification.userId, userId),
					isNull(notification.readAt),
				),
			)
			.returning({ id: notification.id })
	).length > 0;

export const markLinkRead = (
	userId: string,
	type: (typeof notification.$inferSelect)["type"],
	link: string,
	at: Date,
) =>
	db
		.update(notification)
		.set({ readAt: at })
		.where(
			and(
				inbox(userId, null),
				eq(notification.type, type),
				eq(notification.link, link),
				isNull(notification.readAt),
			),
		);

export const markAllRead = async (
	userId: string,
	organizationId: string | null,
	at: Date,
) =>
	(
		await db
			.update(notification)
			.set({ readAt: at })
			.where(and(inbox(userId, organizationId), isNull(notification.readAt)))
			.returning({ id: notification.id })
	).length;

export const deleteNotificationsBefore = async (cutoff: Date) =>
	(
		await db
			.delete(notification)
			.where(lt(notification.createdAt, cutoff))
			.returning({ id: notification.id })
	).length;

export const findUserIdByEmail = async (email: string) => {
	const [row] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email.toLowerCase()));
	return row?.id ?? null;
};
