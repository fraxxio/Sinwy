import {
	organizationPath,
	requireAuth,
	requireMember,
	requirePermission,
} from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	completeOrganizationOnboardingHandler,
	createOrganizationHandler,
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
};
