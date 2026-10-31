import { hasPermission, type ServiceInput } from "@sinwy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ServiceActions } from "#/modules/org-dashboard/components/ServiceActions";
import { ServiceForm } from "#/modules/org-dashboard/components/ServiceForm";
import {
	serviceKeys,
	serviceQuery,
	updateService,
	useUnwrapWrite,
} from "#/modules/org-dashboard/lib/service-queries";
import { toServiceFormValues } from "#/modules/org-dashboard/lib/services";
import { PageHeader } from "#/shared/components/PageHeader";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";

export const Route = createFileRoute("/$organizationSlug/_shell/services/$id")({
	staticData: { crumb: "Service" },
	component: ServiceEditorPage,
});

function ServiceEditorPage() {
	const { id } = Route.useParams();
	const { organization, member } = Route.useRouteContext();
	const canWrite = hasPermission(member.roles, "services:write");
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const unwrap = useUnwrapWrite();
	const service = useQuery(serviceQuery(organization.id, id));

	if (service.isPending) return <Skeleton className="h-96 rounded-xl" />;
	if (service.isError)
		return (
			<>
				<PageHeader title="Service" />
				<FieldError>{service.error.message}</FieldError>
			</>
		);

	const save = async (input: ServiceInput) => {
		try {
			const saved = unwrap(await updateService(organization.id, id, input));
			queryClient.setQueryData(serviceKeys.detail(organization.id, id), saved);
			void queryClient.invalidateQueries({
				queryKey: serviceKeys.list(organization.id),
			});
			toast.add({ type: "success", title: "Service saved", timeout: 4_000 });
			return null;
		} catch (error) {
			return (error as Error).message || null;
		}
	};

	return (
		<>
			<PageHeader
				title={service.data.name}
				action={
					canWrite && (
						<ServiceActions
							organizationId={organization.id}
							organizationSlug={organization.slug}
							service={service.data}
							showEdit={false}
							onArchived={() =>
								navigate({
									to: "/$organizationSlug/services",
									params: { organizationSlug: organization.slug },
								})
							}
						/>
					)
				}
			/>
			<ServiceForm
				key={service.data.id}
				values={toServiceFormValues(service.data)}
				currency={service.data.currency}
				readOnly={!canWrite}
				submitLabel="Save changes"
				pendingLabel="Saving…"
				onSubmit={save}
			/>
		</>
	);
}
