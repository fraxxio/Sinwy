import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account/_shell/payments")({
	staticData: { crumb: "Payments" },
});
