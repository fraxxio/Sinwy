import type { ManualBookingInput } from "@sinwy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ManualBookingForm } from "#/modules/org-dashboard/components/bookings/ManualBookingForm";
import {
	createManualBooking,
	invalidateBookings,
} from "#/modules/org-dashboard/lib/booking-queries";
import {
	availabilityQuery,
	servicesQuery,
	useUnwrapWrite,
} from "#/modules/org-dashboard/lib/service-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { requirePermission } from "#/shared/lib/auth/protected-route";

// a stale or hand-edited start opens the form without one
const searchSchema = z.object({
	start: z.iso.datetime({ offset: true }).optional().catch(undefined),
});

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/bookings/new",
)({
	validateSearch: searchSchema,
	beforeLoad: requirePermission("bookings:write"),
	staticData: { crumb: "New booking" },
	component: NewBookingPage,
});

function NewBookingPage() {
	const { organization } = Route.useRouteContext();
	const { start } = Route.useSearch();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const availability = useQuery(availabilityQuery(organization.id));
	const services = useQuery(servicesQuery(organization.id));

	const create = async (input: ManualBookingInput) => {
		try {
			const booking = unwrap(await createManualBooking(organization.id, input));
			void invalidateBookings(queryClient, organization.id);
			await navigate({
				to: "/dashboard/$organizationSlug/bookings/$id",
				params: { organizationSlug: organization.slug, id: booking.id },
			});
			return null;
		} catch (error) {
			void invalidateBookings(queryClient, organization.id);
			return (error as Error).message || null;
		}
	};

	return (
		<>
			<PageHeader
				title="New booking"
				description="A booking taken by phone or in person. It starts confirmed."
			/>
			<ContentBox>
				{availability.isError || services.isError ? (
					<FieldError>
						{(availability.error ?? services.error)?.message}
					</FieldError>
				) : availability.isPending || services.isPending ? (
					<Skeleton className="h-96 max-w-3xl rounded-md" />
				) : (
					<ManualBookingForm
						organizationId={organization.id}
						timezone={availability.data.timezone}
						services={services.data}
						initialStart={start}
						onSubmit={create}
					/>
				)}
			</ContentBox>
		</>
	);
}
