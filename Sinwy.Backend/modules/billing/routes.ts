import {
	organizationPath,
	requireAuth,
	requireMember,
	requirePermission,
} from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	changePlanHandler,
	downloadInvoiceHandler,
	getCheckoutOrganizationHandler,
	getOrganizationStatusHandler,
	getSubscriptionHandler,
	listInvoicesHandler,
} from "./controller";

export const registerBillingRoutes = (app: IApp) => {
	const billingManager = [requireAuth, requirePermission("billing:manage")];

	app.route(organizationPath("status"), getOrganizationStatusHandler, {
		routeMiddlewares: [requireAuth, requireMember],
	});
	app.route(
		"/api/organizations/checkout/:checkoutId",
		getCheckoutOrganizationHandler,
		{ routeMiddlewares: [requireAuth] },
	);
	app.route(organizationPath("subscription"), getSubscriptionHandler, {
		routeMiddlewares: [requireAuth, requireMember],
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
