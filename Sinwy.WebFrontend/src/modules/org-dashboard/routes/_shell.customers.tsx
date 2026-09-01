import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$organizationSlug/_shell/customers")({
	staticData: { crumb: "Customers" },
});
