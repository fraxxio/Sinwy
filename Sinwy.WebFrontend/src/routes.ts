import { physical, rootRoute } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
	physical("/", "modules/home/routes"),
	physical("/demo", "modules/demo/routes"),
]);
