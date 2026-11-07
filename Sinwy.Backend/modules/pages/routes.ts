import { organizationPath, requireAuth, requirePermission } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	createPageHandler,
	deletePageHandler,
	getPageHandler,
	listPagesHandler,
	savePageContentHandler,
	updatePageHandler,
} from "./controller";

const read = [requireAuth, requirePermission("pages:read")];
const write = [requireAuth, requirePermission("pages:write")];

export const registerPageRoutes = (app: IApp) => {
	app.route(organizationPath("pages"), listPagesHandler, {
		routeMiddlewares: read,
	});
	app.route(organizationPath("pages"), createPageHandler, {
		method: "POST",
		routeMiddlewares: write,
	});
	app.route(organizationPath("pages/:pageId"), getPageHandler, {
		routeMiddlewares: read,
	});
	app.route(organizationPath("pages/:pageId"), updatePageHandler, {
		method: "PATCH",
		routeMiddlewares: write,
	});
	app.route(organizationPath("pages/:pageId"), deletePageHandler, {
		method: "DELETE",
		routeMiddlewares: write,
	});
	app.route(organizationPath("pages/:pageId/content"), savePageContentHandler, {
		method: "PUT",
		routeMiddlewares: write,
	});
};
