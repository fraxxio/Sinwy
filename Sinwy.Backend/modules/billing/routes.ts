import {
	organizationPath,
	requireAuth,
	requireMember,
	requirePermission,
} from "@authModule";
import type { IApp, Middleware } from "@backend/lib/app/types";
import {
	changePlanHandler,
	downloadInvoiceHandler,
	getCheckoutOrganizationHandler,
	getOrganizationStatusHandler,
	getSubscriptionHandler,
	listInvoicesHandler,
} from "./controller";

// billing details and presigned invoice URLs must never sit in a cache
const noStore: Middleware = async (_ctx, next) => {
	const res = await next();
	res.headers.set("Cache-Control", "no-store");
	return res;
};

export const registerBillingRoutes = (app: IApp) => {
	const member = [noStore, requireAuth, requireMember];
	const billingManager = [
		noStore,
		requireAuth,
		requirePermission("billing:manage"),
	];

	app.route(organizationPath("status"), getOrganizationStatusHandler, {
		routeMiddlewares: member,
	});
	app.route(
		"/api/organizations/checkout/:checkoutId",
		getCheckoutOrganizationHandler,
		{ routeMiddlewares: [noStore, requireAuth] },
	);
	app.route(organizationPath("subscription"), getSubscriptionHandler, {
		routeMiddlewares: member,
	});
	app.route(organizationPath("subscription/plan"), changePlanHandler, {
		method: "POST",
		routeMiddlewares: billingManager,
	});
	// invoices carry billing name and address, so billing managers only
	app.route(organizationPath("invoices"), listInvoicesHandler, {
		routeMiddlewares: billingManager,
	});
	app.route(
		organizationPath("invoices/:orderId/download"),
		downloadInvoiceHandler,
		{ routeMiddlewares: billingManager },
	);
};
