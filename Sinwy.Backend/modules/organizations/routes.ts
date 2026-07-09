import type { IApp } from "@backend/lib/app/types";
import {
	createOrganizationHandler,
	getOrganizationStatusHandler,
} from "./controller";

export const registerOrganizationRoutes = (app: IApp) => {
	app.route("/api/organizations", createOrganizationHandler, {
		method: "POST",
	});
	app.route("/api/organizations/:id/status", getOrganizationStatusHandler);
};
