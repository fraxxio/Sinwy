import type { IApp } from "@backend/lib/app/types";
import { serveFileHandler } from "./controller";

export const registerFileRoutes = (app: IApp) => {
	app.route("/api/files/*", serveFileHandler);
};
