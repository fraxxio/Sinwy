import { createFileRoute } from "@tanstack/react-router";
import { ORG_SECTIONS } from "#/modules/org-dashboard/lib/sections";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell/pages")({
	beforeLoad: requirePermission(ORG_SECTIONS.pages.permission),
	staticData: { crumb: "Pages" },
});
