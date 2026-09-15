import {
	ORGANIZATION_PARAM,
	requireAuth,
	requireMember,
	requirePermission,
} from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	completeOrganizationOnboardingHandler,
	createOrganizationHandler,
	getCheckoutOrganizationHandler,
	getOrganizationOnboardingHandler,
	getOrganizationStatusHandler,
	saveOrganizationProfileHandler,
} from "./controller";

const orgPath = (suffix: string) =>
	`/api/organizations/:${ORGANIZATION_PARAM}/${suffix}`;

export const registerOrganizationRoutes = (app: IApp) => {
	app.route("/api/organizations", createOrganizationHandler, {
		method: "POST",
		routeMiddlewares: [requireAuth],
	});
	app.route(orgPath("status"), getOrganizationStatusHandler, {
		routeMiddlewares: [requireAuth, requireMember],
	});
	app.route(orgPath("onboarding"), getOrganizationOnboardingHandler, {
		routeMiddlewares: [requireAuth, requireMember],
	});
	app.route(
		orgPath("onboarding/complete"),
		completeOrganizationOnboardingHandler,
		{
			method: "POST",
			routeMiddlewares: [requireAuth, requirePermission("settings:manage")],
		},
	);
	app.route(orgPath("profile"), saveOrganizationProfileHandler, {
		method: "PUT",
		routeMiddlewares: [requireAuth, requirePermission("settings:manage")],
	});
	app.route(
		"/api/organizations/checkout/:checkoutId",
		getCheckoutOrganizationHandler,
		{ routeMiddlewares: [requireAuth] },
	);
};
