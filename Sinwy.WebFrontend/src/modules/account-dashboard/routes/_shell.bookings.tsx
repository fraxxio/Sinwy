import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account/_shell/bookings")({
	staticData: { crumb: "Bookings" },
});
