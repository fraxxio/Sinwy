import {
	organizationPath,
	requireAuth,
	requireFeature,
	requirePermission,
} from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	exportAnalyticsHandler,
	getBookingsBreakdownHandler,
	getBookingsHandler,
	getFunnelHandler,
	getTrafficBreakdownHandler,
	getTrafficHandler,
	trackEventHandler,
} from "./controller";

const read = [requireAuth, requirePermission("analytics:read")];
const readAdvanced = [...read, requireFeature("analytics-advanced")];

export const registerAnalyticsRoutes = (app: IApp) => {
	app.route(organizationPath("analytics/traffic"), getTrafficHandler, {
		routeMiddlewares: read,
	});
	app.route(
		organizationPath("analytics/traffic/breakdown"),
		getTrafficBreakdownHandler,
		{ routeMiddlewares: readAdvanced },
	);
	app.route(organizationPath("analytics/bookings"), getBookingsHandler, {
		routeMiddlewares: read,
	});
	app.route(
		organizationPath("analytics/bookings/breakdown"),
		getBookingsBreakdownHandler,
		{ routeMiddlewares: readAdvanced },
	);
	app.route(organizationPath("analytics/funnel"), getFunnelHandler, {
		routeMiddlewares: readAdvanced,
	});
	app.route(organizationPath("analytics/export"), exportAnalyticsHandler, {
		routeMiddlewares: readAdvanced,
	});
};

export const registerPublicAnalyticsRoutes = (app: IApp) => {
	app.route("/api/public/organizations/:slug/events", trackEventHandler, {
		method: "POST",
	});
};
