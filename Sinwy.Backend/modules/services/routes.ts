import { organizationPath, requireAuth, requirePermission } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	archiveServiceHandler,
	createServiceHandler,
	duplicateServiceHandler,
	getServiceHandler,
	listServicesHandler,
	updateServiceHandler,
} from "./controller";

const read = [requireAuth, requirePermission("services:read")];
const write = [requireAuth, requirePermission("services:write")];

export const registerServiceRoutes = (app: IApp) => {
	app.route(organizationPath("services"), listServicesHandler, {
		routeMiddlewares: read,
	});
	app.route(organizationPath("services"), createServiceHandler, {
		method: "POST",
		routeMiddlewares: write,
	});
	app.route(organizationPath("services/:serviceId"), getServiceHandler, {
		routeMiddlewares: read,
	});
	app.route(organizationPath("services/:serviceId"), updateServiceHandler, {
		method: "PATCH",
		routeMiddlewares: write,
	});
	app.route(organizationPath("services/:serviceId"), archiveServiceHandler, {
		method: "DELETE",
		routeMiddlewares: write,
	});
	app.route(
		organizationPath("services/:serviceId/duplicate"),
		duplicateServiceHandler,
		{ method: "POST", routeMiddlewares: write },
	);
};
