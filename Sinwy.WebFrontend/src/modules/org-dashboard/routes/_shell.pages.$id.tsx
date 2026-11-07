import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/pages/$id",
)({
	staticData: { crumb: "Page" },
});
