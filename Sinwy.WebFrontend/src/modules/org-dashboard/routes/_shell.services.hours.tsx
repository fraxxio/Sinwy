import { type AvailabilityInput, hasPermission } from "@sinwy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BusinessHoursForm } from "#/modules/org-dashboard/components/BusinessHoursForm";
import { ClosuresList } from "#/modules/org-dashboard/components/ClosuresList";
import { toBusinessHoursFormValues } from "#/modules/org-dashboard/lib/business-hours";
import {
	availabilityQuery,
	saveAvailability,
	serviceKeys,
	useUnwrapWrite,
} from "#/modules/org-dashboard/lib/service-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";

export const Route = createFileRoute(
	"/$organizationSlug/_shell/services/hours",
)({
	staticData: { crumb: "Business hours" },
	component: BusinessHoursPage,
});

function BusinessHoursPage() {
	const { organization, member } = Route.useRouteContext();
	const canWrite = hasPermission(member.roles, "services:write");
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const availability = useQuery(availabilityQuery(organization.id));

	const header = (
		<PageHeader
			title="Business hours"
			description="When customers can book your services."
		/>
	);

	if (availability.isPending)
		return (
			<>
				{header}
				<Skeleton className="h-96 rounded-xl" />
			</>
		);
	if (availability.isError)
		return (
			<>
				{header}
				<FieldError>{availability.error.message}</FieldError>
			</>
		);

	const save = async (input: AvailabilityInput) => {
		try {
			const saved = unwrap(await saveAvailability(organization.id, input));
			queryClient.setQueryData(
				serviceKeys.availability(organization.id),
				saved,
			);
			toast.add({ type: "success", title: "Hours saved", timeout: 4_000 });
			return null;
		} catch (error) {
			return (error as Error).message || null;
		}
	};

	return (
		<>
			{header}
			<ContentBox className="divide-y">
				<BusinessHoursForm
					values={toBusinessHoursFormValues(availability.data)}
					readOnly={!canWrite}
					onSubmit={save}
				/>
				<ClosuresList
					organizationId={organization.id}
					timezone={availability.data.timezone}
					closures={availability.data.closures}
					readOnly={!canWrite}
				/>
			</ContentBox>
		</>
	);
}
