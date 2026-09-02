import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$organizationSlug/_shell/bookings")({
	staticData: { crumb: "Bookings" },
});
