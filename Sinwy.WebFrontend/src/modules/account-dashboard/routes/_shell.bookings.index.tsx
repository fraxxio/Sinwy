import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheckIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/account/_shell/bookings/")({
	component: BookingsPage,
});

function BookingsPage() {
	return (
		<>
			<PageHeader
				title="Bookings"
				description="Appointments you've booked with businesses on Sinwy."
			/>
			<EmptyState
				icon={<CalendarCheckIcon />}
				title="No bookings yet"
				description="When you book a service, your appointments will appear here."
			/>
		</>
	);
}
