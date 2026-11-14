import { membershipFrom, sessionFrom } from "@authModule";
import { fail, ok } from "@backend/lib/app/respond";
import type { Handler, IReqContext } from "@backend/lib/app/types";
import type { NotificationUnreadCountDto } from "@sinwy/shared";
import {
	getUnreadCount,
	listNotifications,
	parseNotificationCursor,
	readAllNotifications,
	readNotification,
} from "./service";

type Scope = (c: IReqContext) => string | null;

/** Org routes run behind `requireMember`, so a non-member or an organization scheduled for deletion never gets here. */
const organizationScope: Scope = (c) => membershipFrom(c).organizationId;
const personalScope: Scope = () => null;

const listHandler =
	(scope: Scope): Handler =>
	async (c) => {
		const raw = new URL(c.req.url).searchParams.get("before");
		const before = raw ? parseNotificationCursor(raw) : null;
		if (raw && !before) return fail("Invalid cursor", 400);
		return ok(
			await listNotifications(sessionFrom(c).user.id, scope(c), before),
		);
	};

const unreadCountHandler =
	(scope: Scope): Handler =>
	async (c) =>
		ok<NotificationUnreadCountDto>({
			count: await getUnreadCount(sessionFrom(c).user.id, scope(c)),
		});

const readAllHandler =
	(scope: Scope): Handler =>
	async (c) => {
		await readAllNotifications(sessionFrom(c).user.id, scope(c));
		return ok(null);
	};

export const listOrganizationNotificationsHandler =
	listHandler(organizationScope);
export const organizationUnreadCountHandler =
	unreadCountHandler(organizationScope);
export const readAllOrganizationNotificationsHandler =
	readAllHandler(organizationScope);

export const listPersonalNotificationsHandler = listHandler(personalScope);
export const personalUnreadCountHandler = unreadCountHandler(personalScope);
export const readAllPersonalNotificationsHandler =
	readAllHandler(personalScope);

export const readNotificationHandler: Handler = async (c) => {
	const { notificationId } = c.req.params as { notificationId: string };
	await readNotification(sessionFrom(c).user.id, notificationId);
	return ok(null);
};
