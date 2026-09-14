import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell/pages")({
	beforeLoad: requirePermission("pages:read"),
	staticData: { crumb: "Pages" },
});
