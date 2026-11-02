import { organizationPath, requireAuth, requirePermission } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	createManualBookingHandler,
	getBookingHandler,
	listBookingsHandler,
	listBookingTimesHandler,
	listCalendarBookingsHandler,
} from "./controller";

const read = [requireAuth, requirePermission("bookings:read")];
const write = [requireAuth, requirePermission("bookings:write")];

export const registerBookingRoutes = (app: IApp) => {
	app.route(organizationPath("bookings"), listBookingsHandler, {
		routeMiddlewares: read,
	});
	app.route(organizationPath("bookings"), createManualBookingHandler, {
		method: "POST",
		routeMiddlewares: write,
	});
	app.route(organizationPath("bookings/times"), listBookingTimesHandler, {
		routeMiddlewares: read,
	});
	app.route(
		organizationPath("bookings/calendar"),
		listCalendarBookingsHandler,
		{
			routeMiddlewares: read,
		},
	);
	app.route(organizationPath("bookings/:bookingId"), getBookingHandler, {
		routeMiddlewares: read,
	});
};
