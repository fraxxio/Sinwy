import { requireAuth } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	completeOrganizationOnboardingHandler,
	createOrganizationHandler,
	getCheckoutOrganizationHandler,
	getOrganizationOnboardingHandler,
	getOrganizationStatusHandler,
	saveOrganizationProfileHandler,
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
		"/api/organizations/:id/onboarding",
		getOrganizationOnboardingHandler,
		{ routeMiddlewares: [requireAuth] },
	);
	app.route(
		"/api/organizations/:id/onboarding/complete",
		completeOrganizationOnboardingHandler,
		{ method: "POST", routeMiddlewares: [requireAuth] },
	);
	app.route("/api/organizations/:id/profile", saveOrganizationProfileHandler, {
		method: "PUT",
		routeMiddlewares: [requireAuth],
	});
	app.route(
		"/api/organizations/checkout/:checkoutId",
		getCheckoutOrganizationHandler,
		{ routeMiddlewares: [requireAuth] },
	);
};
