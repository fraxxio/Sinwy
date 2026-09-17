import { requireAuth } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	getDeletionPreviewHandler,
	getPostLoginFlagsHandler,
	removeAvatarHandler,
	setPasswordHandler,
	uploadAvatarHandler,
} from "./controller";

export const registerUserRoutes = (app: IApp) => {
	app.route("/api/user/flags", getPostLoginFlagsHandler, {
		routeMiddlewares: [requireAuth],
	});
	app.route("/api/user/password", setPasswordHandler, {
		method: "POST",
		routeMiddlewares: [requireAuth],
	});
	app.route("/api/user/avatar", uploadAvatarHandler, {
		method: "POST",
		routeMiddlewares: [requireAuth],
	});
	app.route("/api/user/avatar", removeAvatarHandler, {
		method: "DELETE",
		routeMiddlewares: [requireAuth],
	});
	app.route("/api/user/deletion-preview", getDeletionPreviewHandler, {
		routeMiddlewares: [requireAuth],
	});
};
