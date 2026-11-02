import { physical, rootRoute } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
	physical("/", "modules/home/routes"),
	physical("/auth", "modules/auth/routes"),
	physical("/account", "modules/account-dashboard/routes"),
	physical("/organizations", "modules/organizations/routes"),
	physical("/checkout", "modules/checkout/routes"),
	physical("/dashboard/$organizationSlug", "modules/org-dashboard/routes"),
	// last, so every static prefix above outranks the dynamic segment
	physical("/$organizationSlug", "modules/storefront/routes"),
]);
