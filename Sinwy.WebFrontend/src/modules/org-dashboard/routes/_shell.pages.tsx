import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$organizationSlug/_shell/pages")({
	staticData: { crumb: "Pages" },
});
