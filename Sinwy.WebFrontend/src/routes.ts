import { physical, rootRoute } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
	physical("/", "modules/home/routes"),
	physical("/auth", "modules/auth/routes"),
	physical("/account", "modules/account-dashboard/routes"),
	physical("/organizations", "modules/organizations/routes"),
	physical("/checkout", "modules/checkout/routes"),
	// Dashboard lives at the root under the org slug, so it must stay last:
	// every static prefix above outranks this dynamic segment.
	physical("/$organizationSlug", "modules/org-dashboard/routes"),
]);
