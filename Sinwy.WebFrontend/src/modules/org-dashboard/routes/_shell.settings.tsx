import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$organizationSlug/_shell/settings")({
	staticData: { crumb: "Settings" },
});
