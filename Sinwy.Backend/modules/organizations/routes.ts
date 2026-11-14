import {
	organizationPath,
	requireAuth,
	requireMember,
	requirePermission,
} from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	activateOrganizationHandler,
	changeOrganizationTimezoneHandler,
	completeOrganizationOnboardingHandler,
	createOrganizationHandler,
	deactivateOrganizationHandler,
	getInvitationPreviewHandler,
	getOrganizationGeneralHandler,
	getOrganizationOnboardingHandler,
	listActivityHandler,
	listOrganizationsHandler,
	removeOrganizationLogoHandler,
	renameOrganizationHandler,
	saveOrganizationProfileHandler,
	uploadOrganizationLogoHandler,
} from "./controller";

export const registerOrganizationRoutes = (app: IApp) => {
	const manageSettings = [requireAuth, requirePermission("settings:manage")];
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
	app.route(organizationPath("general"), getOrganizationGeneralHandler, {
		routeMiddlewares: manageSettings,
	});
	app.route(organizationPath("name"), renameOrganizationHandler, {
		method: "PUT",
		routeMiddlewares: manageSettings,
	});
	app.route(organizationPath("timezone"), changeOrganizationTimezoneHandler, {
		method: "PUT",
		routeMiddlewares: manageSettings,
	});
	app.route(organizationPath("logo"), uploadOrganizationLogoHandler, {
		method: "POST",
		routeMiddlewares: manageSettings,
	});
	app.route(organizationPath("logo"), removeOrganizationLogoHandler, {
		method: "DELETE",
		routeMiddlewares: manageSettings,
	});
	app.route(organizationPath("activity"), listActivityHandler, {
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
	app.route(
		"/api/public/invitations/:invitationId",
		getInvitationPreviewHandler,
	);
};
