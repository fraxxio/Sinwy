import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell/services")({
	beforeLoad: requirePermission("services:read"),
	staticData: { crumb: "Services" },
});
