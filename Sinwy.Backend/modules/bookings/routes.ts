import { organizationPath, requireAuth, requirePermission } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	cancelBookingHandler,
	completeBookingHandler,
	confirmBookingHandler,
	createManualBookingHandler,
	createSelfBookingHandler,
	getBookingHandler,
	getOverviewHandler,
	getStorefrontHandler,
	listBookingsHandler,
	listBookingTimesHandler,
	listCalendarBookingsHandler,
	listStorefrontTimesHandler,
	markNoShowHandler,
	rescheduleBookingHandler,
	updateBookingHandler,
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
	app.route(organizationPath("bookings/overview"), getOverviewHandler, {
		routeMiddlewares: read,
	});
	app.route(organizationPath("bookings/:bookingId"), getBookingHandler, {
		routeMiddlewares: read,
	});
	app.route(organizationPath("bookings/:bookingId"), updateBookingHandler, {
		method: "PATCH",
		routeMiddlewares: write,
	});
	const writes = {
		confirm: confirmBookingHandler,
		cancel: cancelBookingHandler,
		complete: completeBookingHandler,
		"no-show": markNoShowHandler,
		reschedule: rescheduleBookingHandler,
	};
	for (const [action, handler] of Object.entries(writes))
		app.route(organizationPath(`bookings/:bookingId/${action}`), handler, {
			method: "POST",
			routeMiddlewares: write,
		});
};

const STOREFRONT = "/api/public/organizations/:slug";

/** Booking pages: anyone may browse an active organization's services and times; booking needs a session. */
export const registerStorefrontRoutes = (app: IApp) => {
	app.route(STOREFRONT, getStorefrontHandler);
	app.route(
		`${STOREFRONT}/services/:serviceId/times`,
		listStorefrontTimesHandler,
	);
	app.route(`${STOREFRONT}/bookings`, createSelfBookingHandler, {
		method: "POST",
		routeMiddlewares: [requireAuth],
	});
};
