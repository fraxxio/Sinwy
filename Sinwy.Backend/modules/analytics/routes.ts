import type { IApp } from "@backend/lib/app/types";
import { trackEventHandler } from "./controller";

export const registerPublicAnalyticsRoutes = (app: IApp) => {
	app.route("/api/public/organizations/:slug/events", trackEventHandler, {
		method: "POST",
	});
};
