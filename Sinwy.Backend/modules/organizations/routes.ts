import { requireAuth, requirePermission } from "@authModule";
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
	app.route(
		"/api/organizations/:organizationId/status",
		getOrganizationStatusHandler,
		{
			routeMiddlewares: [requireAuth],
		},
	);
	app.route(
		"/api/organizations/:organizationId/onboarding",
		getOrganizationOnboardingHandler,
		{ routeMiddlewares: [requireAuth] },
	);
	app.route(
		"/api/organizations/:organizationId/onboarding/complete",
		completeOrganizationOnboardingHandler,
		{
			method: "POST",
			routeMiddlewares: [requireAuth, requirePermission("settings:manage")],
		},
	);
	app.route(
		"/api/organizations/:organizationId/profile",
		saveOrganizationProfileHandler,
		{
			method: "PUT",
			routeMiddlewares: [requireAuth, requirePermission("settings:manage")],
		},
	);
	app.route(
		"/api/organizations/checkout/:checkoutId",
		getCheckoutOrganizationHandler,
		{ routeMiddlewares: [requireAuth] },
	);
};
