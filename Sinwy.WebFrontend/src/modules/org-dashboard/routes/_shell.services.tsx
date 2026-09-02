import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$organizationSlug/_shell/services")({
	staticData: { crumb: "Services" },
});
