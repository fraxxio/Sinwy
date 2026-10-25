import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import { startJobs } from "@backend/lib/jobs";
import { registerBillingRoutes } from "@billingModule";
import appConfig from "@config";
import { registerFileRoutes } from "@filesModule";
import {
	purgeOrganizationsJob,
	registerOrganizationRoutes,
} from "@organizationsModule";
import { expireTransfersJob, registerTransferRoutes } from "@transfersModule";
import { registerUserRoutes } from "@userModule";

const app = createApp();

registerAuthRoutes(app);
registerOrganizationRoutes(app);
registerBillingRoutes(app);
registerTransferRoutes(app);
registerUserRoutes(app);
registerFileRoutes(app);

const server = app.listen(appConfig.PORT);

startJobs([purgeOrganizationsJob, expireTransfersJob]);

console.log(`Listening on ${server.url}, port ${server.port}`);
