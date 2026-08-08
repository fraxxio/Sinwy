import { requireAuth } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import { getPostLoginFlagsHandler } from "./controller";

export const registerUserRoutes = (app: IApp) => {
	app.route("/api/user/flags", getPostLoginFlagsHandler, {
		routeMiddlewares: [requireAuth],
	});
};
