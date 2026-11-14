import { organizationPath, requireAuth, requireMember } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	listOrganizationNotificationsHandler,
	listPersonalNotificationsHandler,
	organizationUnreadCountHandler,
	personalUnreadCountHandler,
	readAllOrganizationNotificationsHandler,
	readAllPersonalNotificationsHandler,
	readNotificationHandler,
} from "./controller";

const PERSONAL = "/api/account/notifications";

export const registerNotificationRoutes = (app: IApp) => {
	const member = [requireAuth, requireMember];
	app.route(
		organizationPath("notifications"),
		listOrganizationNotificationsHandler,
		{ routeMiddlewares: member },
	);
	app.route(
		organizationPath("notifications/unread-count"),
		organizationUnreadCountHandler,
		{ routeMiddlewares: member },
	);
	app.route(
		organizationPath("notifications/read-all"),
		readAllOrganizationNotificationsHandler,
		{ method: "POST", routeMiddlewares: member },
	);
	app.route(PERSONAL, listPersonalNotificationsHandler, {
		routeMiddlewares: [requireAuth],
	});
	app.route(`${PERSONAL}/unread-count`, personalUnreadCountHandler, {
		routeMiddlewares: [requireAuth],
	});
	app.route(`${PERSONAL}/read-all`, readAllPersonalNotificationsHandler, {
		method: "POST",
		routeMiddlewares: [requireAuth],
	});
	// any of the user's notifications, so both bells share it
	app.route(
		"/api/notifications/:notificationId/read",
		readNotificationHandler,
		{
			method: "POST",
			routeMiddlewares: [requireAuth],
		},
	);
};
