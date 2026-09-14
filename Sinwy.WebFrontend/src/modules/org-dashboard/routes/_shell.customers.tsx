import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell/customers")({
	beforeLoad: requirePermission("customers:read"),
	staticData: { crumb: "Customers" },
});
