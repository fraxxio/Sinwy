import { organizationPath, requireAuth, requirePermission } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	acceptTransferHandler,
	cancelTransferHandler,
	declineTransferHandler,
	getOpenTransferHandler,
	listIncomingTransfersHandler,
	offerTransferHandler,
} from "./controller";

export const registerTransferRoutes = (app: IApp) => {
	// billing:manage is the owner's alone
	const owner = [requireAuth, requirePermission("billing:manage")];
	app.route(organizationPath("transfer"), getOpenTransferHandler, {
		routeMiddlewares: owner,
	});
	app.route(organizationPath("transfer"), offerTransferHandler, {
		method: "POST",
		routeMiddlewares: owner,
	});
	app.route(organizationPath("transfer"), cancelTransferHandler, {
		method: "DELETE",
		routeMiddlewares: owner,
	});
	app.route("/api/transfers/incoming", listIncomingTransfersHandler, {
		routeMiddlewares: [requireAuth],
	});
	app.route("/api/transfers/:transferId/accept", acceptTransferHandler, {
		method: "POST",
		routeMiddlewares: [requireAuth],
	});
	app.route("/api/transfers/:transferId/decline", declineTransferHandler, {
		method: "POST",
		routeMiddlewares: [requireAuth],
	});
};
