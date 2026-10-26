import {
	organizationPath,
	requireAuth,
	requireMember,
	requirePermission,
} from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	activateOrganizationHandler,
	completeOrganizationOnboardingHandler,
	createOrganizationHandler,
	deactivateOrganizationHandler,
	getOrganizationOnboardingHandler,
	listOrganizationsHandler,
	saveOrganizationProfileHandler,
} from "./controller";

export const registerOrganizationRoutes = (app: IApp) => {
	app.route("/api/organizations", createOrganizationHandler, {
		method: "POST",
		routeMiddlewares: [requireAuth],
	});
	app.route("/api/organizations", listOrganizationsHandler, {
		routeMiddlewares: [requireAuth],
	});
	app.route(organizationPath("onboarding"), getOrganizationOnboardingHandler, {
		routeMiddlewares: [requireAuth, requireMember],
	});
	app.route(
		organizationPath("onboarding/complete"),
		completeOrganizationOnboardingHandler,
		{
			method: "POST",
			routeMiddlewares: [requireAuth, requirePermission("settings:manage")],
		},
	);
	app.route(organizationPath("profile"), saveOrganizationProfileHandler, {
		method: "PUT",
		routeMiddlewares: [requireAuth, requirePermission("settings:manage")],
	});
	// owner only: the slot is the owner's, so the repository checks ownership
	app.route(
		"/api/account/organizations/:organizationId/activate",
		activateOrganizationHandler,
		{ method: "POST", routeMiddlewares: [requireAuth] },
	);
	app.route(
		"/api/account/organizations/:organizationId/deactivate",
		deactivateOrganizationHandler,
		{ method: "POST", routeMiddlewares: [requireAuth] },
	);
};
