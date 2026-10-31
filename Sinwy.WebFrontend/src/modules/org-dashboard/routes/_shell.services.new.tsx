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
			const service = unwrap(await createService(organization.id, input));
			void queryClient.invalidateQueries({
				queryKey: serviceKeys.all(organization.id),
			});
			await navigate({
				to: "/$organizationSlug/services/$id",
				params: { organizationSlug: organization.slug, id: service.id },
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
