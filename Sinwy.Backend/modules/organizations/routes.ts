import { requireAuth } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	createOrganizationHandler,
	getCheckoutOrganizationHandler,
	getOrganizationStatusHandler,
} from "./controller";

export const registerOrganizationRoutes = (app: IApp) => {
	app.route("/api/organizations", createOrganizationHandler, {
		method: "POST",
		routeMiddlewares: [requireAuth],
	});
	app.route("/api/organizations/:id/status", getOrganizationStatusHandler, {
		routeMiddlewares: [requireAuth],
	});
	app.route(
		"/api/organizations/checkout/:checkoutId",
		getCheckoutOrganizationHandler,
		{ routeMiddlewares: [requireAuth] },
	);
};
