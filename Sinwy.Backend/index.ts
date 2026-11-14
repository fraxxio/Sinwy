import {
	registerAnalyticsRoutes,
	registerPublicAnalyticsRoutes,
} from "@analyticsModule";
import { registerAuthRoutes } from "@authModule";
import { jobs } from "@backend/jobs";
import createApp from "@backend/lib/app";
import { startJobs } from "@backend/lib/jobs";
import { registerBillingRoutes } from "@billingModule";
import {
	registerAccountBookingRoutes,
	registerBookingRoutes,
	registerStorefrontRoutes,
} from "@bookingsModule";
import appConfig from "@config";
import { registerFileRoutes } from "@filesModule";
import { registerNotificationRoutes } from "@notificationsModule";
import { registerOrganizationRoutes } from "@organizationsModule";
import { registerPageRoutes, registerPublicPageRoutes } from "@pagesModule";
import {
	registerAccountPaymentRoutes,
	registerPaymentRoutes,
} from "@paymentsModule";
import { registerServiceRoutes } from "@servicesModule";
import { registerTransferRoutes } from "@transfersModule";
import { registerUserRoutes } from "@userModule";

const app = createApp();

registerAuthRoutes(app);
registerOrganizationRoutes(app);
registerBillingRoutes(app);
registerTransferRoutes(app);
registerServiceRoutes(app);
registerBookingRoutes(app);
registerStorefrontRoutes(app);
registerAccountBookingRoutes(app);
registerPaymentRoutes(app);
registerAccountPaymentRoutes(app);
registerPageRoutes(app);
registerPublicPageRoutes(app);
registerAnalyticsRoutes(app);
registerPublicAnalyticsRoutes(app);
registerUserRoutes(app);
registerNotificationRoutes(app);
registerFileRoutes(app);

const server = app.listen(appConfig.PORT);

startJobs(jobs);

console.log(`Listening on ${server.url}, port ${server.port}`);
