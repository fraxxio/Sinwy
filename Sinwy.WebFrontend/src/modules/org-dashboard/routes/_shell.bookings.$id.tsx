import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheckIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/bookings/$id")({
	staticData: { crumb: "Booking" },
	component: BookingDetailPage,
});

function BookingDetailPage() {
	const { id } = Route.useParams();

	return (
		<>
			<PageHeader title={`Booking ${id}`} />
			<EmptyState
				icon={<CalendarCheckIcon />}
				title="Nothing here yet"
				description="Booking details will live here once bookings exist."
			/>
		</>
	);
}
