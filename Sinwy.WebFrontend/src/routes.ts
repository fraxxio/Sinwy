import { physical, rootRoute, route } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
	physical("/", "modules/home/routes"),
	route("/demo/better-auth", "modules/auth/routes/demo.tsx"),
	route("/api/auth/$", "modules/auth/routes/api.ts"),
	physical("/demo", "modules/demo/routes"),
]);
