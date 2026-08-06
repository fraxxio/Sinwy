import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import appConfig from "@config";
import { registerOrganizationRoutes } from "@organizationsModule";
import { registerUserRoutes } from "@userModule";

const app = createApp();

registerAuthRoutes(app);
registerOrganizationRoutes(app);
registerUserRoutes(app);

const server = app.listen(appConfig.PORT);

console.log(`Listening on ${server.url}, port ${server.port}`);
