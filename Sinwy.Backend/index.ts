import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import appConfig from "@config";
import { registerOrganizationRoutes } from "@organizationsModule";

const app = createApp();

registerAuthRoutes(app);
registerOrganizationRoutes(app);

const server = app.listen(appConfig.PORT);

console.log(`Listening on ${server.url}, port ${server.port}`);
