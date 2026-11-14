import type { Job } from "@backend/lib/jobs";
import { createLogger } from "@logger";
import { listEventMembers } from "@organizationsModule";
import {
	NOTIFICATION_PAGE_SIZE,
	NOTIFICATION_RETENTION_DAYS,
	type NotificationDto,
	type NotificationPageDto,
	ORGANIZATION_NOTIFICATION_EVENTS,
	type OrganizationNotificationContent,
	type PersonalNotificationContent,
} from "@sinwy/shared";
import {
	countUnread,
	deleteNotificationsBefore,
	findNotifications,
	findUserIdByEmail,
	insertNotifications,
	markAllRead,
	markLinkRead,
	markRead,
} from "./repository";

const logger = createLogger("notifications");

/*
 * Writers run after the change commits, from the same places that send the
 * emails. Best effort: a failure is logged and never reaches the caller.
 */

/** Every member whose role receives the event, whatever their email choice. */
export const notifyOrganization = async (
	organizationId: string,
	content: OrganizationNotificationContent,
	link: string | null,
	options: { exceptUserId?: string } = {},
) => {
	try {
		const members = await listEventMembers(
			organizationId,
			ORGANIZATION_NOTIFICATION_EVENTS[content.type],
			options,
		);
		await insertNotifications(
			members.map(({ memberId, userId }) => ({
				id: Bun.randomUUIDv7(),
				userId,
				organizationId,
				memberId,
				type: content.type,
				payload: content.payload,
				link,
			})),
		);
	} catch (error) {
		logger.error("Failed to write organization notifications", {
			organizationId,
			type: content.type,
			error,
		});
	}
};

export const notifyUser = async (
	userId: string,
	content: PersonalNotificationContent,
	link: string | null,
) => {
	try {
		await insertNotifications([
			{
				id: Bun.randomUUIDv7(),
				userId,
				type: content.type,
				payload: content.payload,
				link,
			},
		]);
	} catch (error) {
		logger.error("Failed to write a notification", {
			type: content.type,
			error,
		});
	}
};

/** Only an existing account gets one; nothing is kept for an email without a user. */
export const notifyEmail = async (
	email: string,
	content: PersonalNotificationContent,
	link: string | null,
) => {
	try {
		const userId = await findUserIdByEmail(email);
		if (userId) await notifyUser(userId, content, link);
	} catch (error) {
		logger.error("Failed to write a notification", {
			type: content.type,
			error,
		});
	}
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Once an invitation is answered or withdrawn there's nothing left to act on. Best effort. */
export const readInvitationNotifications = async (
	email: string,
	invitePath: string,
) => {
	try {
		const userId = await findUserIdByEmail(email);
		if (userId)
			await markLinkRead(userId, "invitation.received", invitePath, new Date());
	} catch (error) {
		logger.error("Failed to mark invitation notifications read", { error });
	}
};

/** null for anything that isn't an id `listNotifications` handed out. */
export const parseNotificationCursor = (raw: string) =>
	UUID.test(raw) ? raw : null;

/** The organization's inbox, or the personal one when `organizationId` is null. */
export const listNotifications = async (
	userId: string,
	organizationId: string | null,
	beforeId: string | null,
): Promise<NotificationPageDto> => {
	const rows = await findNotifications(
		userId,
		organizationId,
		beforeId,
		NOTIFICATION_PAGE_SIZE + 1,
	);
	const page = rows.slice(0, NOTIFICATION_PAGE_SIZE);
	return {
		notifications: page.map(
			(row) =>
				({
					id: row.id,
					type: row.type,
					payload: row.payload,
					link: row.link,
					readAt: row.readAt?.toISOString() ?? null,
					createdAt: row.createdAt.toISOString(),
				}) as NotificationDto,
		),
		nextCursor:
			rows.length > NOTIFICATION_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
	};
};

export const getUnreadCount = (userId: string, organizationId: string | null) =>
	countUnread(userId, organizationId);

/** Marking a notification the user doesn't have, or one already read, changes nothing. */
export const readNotification = (userId: string, id: string) =>
	markRead(userId, id, new Date());

export const readAllNotifications = (
	userId: string,
	organizationId: string | null,
) => markAllRead(userId, organizationId, new Date());

const RETENTION_MS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const purgeOldNotifications = async (now = new Date()) => {
	const deleted = await deleteNotificationsBefore(
		new Date(now.getTime() - RETENTION_MS),
	);
	if (deleted > 0) logger.info("Deleted old notifications", { deleted });
	return deleted;
};

export const purgeNotificationsJob: Job<number> = {
	name: "purge-notifications",
	intervalMs: 60 * 60 * 1000,
	run: () => purgeOldNotifications(),
};
