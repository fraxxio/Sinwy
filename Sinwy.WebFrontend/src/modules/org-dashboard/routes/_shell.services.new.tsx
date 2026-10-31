import { DEFAULT_CURRENCY, type ServiceInput } from "@sinwy/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ServiceForm } from "#/modules/org-dashboard/components/ServiceForm";
import {
	createService,
	serviceKeys,
	useUnwrapWrite,
} from "#/modules/org-dashboard/lib/service-queries";
import { NEW_SERVICE_VALUES } from "#/modules/org-dashboard/lib/services";
import { PageHeader } from "#/shared/components/PageHeader";
import { toast } from "#/shared/components/ui/toast";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell/services/new")({
	beforeLoad: requirePermission("services:write"),
	staticData: { crumb: "New service" },
	component: NewServicePage,
});

function NewServicePage() {
	const { organization } = Route.useRouteContext();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const unwrap = useUnwrapWrite();

	const create = async (input: ServiceInput) => {
		try {
			unwrap(await createService(organization.id, input));
			await queryClient.invalidateQueries({
				queryKey: serviceKeys.list(organization.id),
				refetchType: "all",
			});
			toast.add({ type: "success", title: "Service created", timeout: 4_000 });
			await navigate({
				to: "/$organizationSlug/services",
				params: { organizationSlug: organization.slug },
			});
			return null;
		} catch (error) {
			return (error as Error).message || null;
		}
	};

	return (
		<>
			<PageHeader title="New service" />
			<ServiceForm
				values={NEW_SERVICE_VALUES}
				currency={organization.currency ?? DEFAULT_CURRENCY}
				readOnly={false}
				submitLabel="Create service"
				pendingLabel="Creating…"
				onSubmit={create}
			/>
		</>
	);
}
