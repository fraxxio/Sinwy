import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheckIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/bookings/")({
	component: BookingsPage,
});

function BookingsPage() {
	return (
		<>
			<PageHeader
				title="Bookings"
				description="Every appointment your customers have booked with you."
			/>
			<EmptyState
				icon={<CalendarCheckIcon />}
				title="No bookings yet"
				description="When customers book one of your services, their appointments will appear here."
			/>
		</>
	);
}
