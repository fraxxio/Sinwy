import { auth } from "@authModule";
import type { IApp } from "@backend/lib/app/types";

/**
 * Docs `/api/auth/reference`
 */
export const registerAuthRoutes = (app: IApp) => {
	app.route(
		"/api/auth/*",
		async (c) => {
			return auth.handler(c.req);
		},
		{ method: ["POST", "GET"] },
	);
};
