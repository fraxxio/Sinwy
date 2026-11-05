import { organizationPath, requireAuth, requirePermission } from "@authModule";
import type { IApp } from "@backend/lib/app/types";
import {
	exportPaymentsHandler,
	getCustomerPaymentHandler,
	listCustomerPaymentsHandler,
	listPaymentsHandler,
	markPaidHandler,
} from "./controller";

const read = [requireAuth, requirePermission("payments:read")];

export const registerPaymentRoutes = (app: IApp) => {
	app.route(organizationPath("payments"), listPaymentsHandler, {
		routeMiddlewares: read,
	});
	app.route(organizationPath("payments/export"), exportPaymentsHandler, {
		routeMiddlewares: read,
	});
	app.route(
		organizationPath("payments/:paymentId/mark-paid"),
		markPaidHandler,
		{
			method: "POST",
			routeMiddlewares: [requireAuth, requirePermission("payments:write")],
		},
	);
};

const ACCOUNT = "/api/account/payments";

/** Customer Mode: payments for the session user's own bookings. */
export const registerAccountPaymentRoutes = (app: IApp) => {
	app.route(ACCOUNT, listCustomerPaymentsHandler, {
		routeMiddlewares: [requireAuth],
	});
	app.route(`${ACCOUNT}/:paymentId`, getCustomerPaymentHandler, {
		routeMiddlewares: [requireAuth],
	});
};
