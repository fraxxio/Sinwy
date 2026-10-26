import { organizationPath, requireAuth, requireMember } from "@authModule";
import type { IApp, Middleware } from "@backend/lib/app/types";
import {
	cancelHandler,
	cancelPlanChangeHandler,
	changePlanHandler,
	downloadInvoiceHandler,
	getOrganizationStatusHandler,
	getSubscriptionHandler,
	listInvoicesHandler,
	resumeHandler,
	suspendHandler,
	uncancelHandler,
	unsuspendHandler,
} from "./controller";

// billing details and presigned invoice URLs must never sit in a cache
const noStore: Middleware = async (_ctx, next) => {
	const res = await next();
	res.headers.set("Cache-Control", "no-store");
	return res;
};

export const registerBillingRoutes = (app: IApp) => {
	const account = [noStore, requireAuth];

	app.route(organizationPath("status"), getOrganizationStatusHandler, {
		routeMiddlewares: [noStore, requireAuth, requireMember],
	});
	app.route("/api/account/subscription", getSubscriptionHandler, {
		routeMiddlewares: account,
	});
	for (const [path, handler] of [
		["plan", changePlanHandler],
		["plan/cancel", cancelPlanChangeHandler],
		["suspend", suspendHandler],
		["unsuspend", unsuspendHandler],
		["resume", resumeHandler],
		["cancel", cancelHandler],
		["uncancel", uncancelHandler],
	] as const)
		app.route(`/api/account/subscription/${path}`, handler, {
			method: "POST",
			routeMiddlewares: account,
		});
	app.route("/api/account/invoices", listInvoicesHandler, {
		routeMiddlewares: account,
	});
	app.route("/api/account/invoices/:orderId/download", downloadInvoiceHandler, {
		routeMiddlewares: account,
	});
};
