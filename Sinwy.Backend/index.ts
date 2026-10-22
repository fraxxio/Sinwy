import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import { registerBillingRoutes } from "@billingModule";
import appConfig from "@config";
import { registerFileRoutes } from "@filesModule";
import { registerOrganizationRoutes } from "@organizationsModule";
import { registerUserRoutes } from "@userModule";

const app = createApp();

registerAuthRoutes(app);
registerOrganizationRoutes(app);
registerBillingRoutes(app);
registerUserRoutes(app);
registerFileRoutes(app);

const server = app.listen(appConfig.PORT);

console.log(`Listening on ${server.url}, port ${server.port}`);
