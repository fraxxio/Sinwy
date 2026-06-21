import { registerAuthRoutes } from "@authModule";
import createApp from "@backend/lib/app";
import appConfig from "@config";

const app = createApp();

registerAuthRoutes(app);

const server = app.listen(appConfig.PORT);

console.log(`Listening on ${server.url}, port ${server.port}`);
