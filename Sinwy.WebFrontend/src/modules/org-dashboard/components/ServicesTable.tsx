import type { ServiceDto } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ServiceActions } from "#/modules/org-dashboard/components/ServiceActions";
import {
	serviceKeys,
	updateService,
	useUnwrapWrite,
} from "#/modules/org-dashboard/lib/service-queries";
import { formatDuration } from "#/modules/org-dashboard/lib/services";
import { Badge } from "#/shared/components/ui/badge";
import { Switch } from "#/shared/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/shared/components/ui/table";
import { toast } from "#/shared/components/ui/toast";
import { formatMinorUnits } from "#/shared/lib/money";

export function ServicesTable({
	organizationId,
	organizationSlug,
	services,
	canWrite,
}: {
	organizationId: string;
	organizationSlug: string;
	services: ServiceDto[];
	canWrite: boolean;
}) {
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const listKey = serviceKeys.list(organizationId);

	const toggle = useMutation({
		mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
			unwrap(await updateService(organizationId, id, { isActive })),
		onMutate: async ({ id, isActive }) => {
			await queryClient.cancelQueries({ queryKey: listKey });
			const previous = queryClient.getQueryData<ServiceDto[]>(listKey);
			queryClient.setQueryData<ServiceDto[]>(listKey, (list) =>
				list?.map((service) =>
					service.id === id ? { ...service, isActive } : service,
				),
			);
			return { previous };
		},
		onError: (error, _variables, context) => {
			queryClient.setQueryData(listKey, context?.previous);
			if (error.message)
				toast.add({ type: "error", title: error.message, timeout: 6_000 });
		},
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: serviceKeys.all(organizationId),
			}),
	});

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Duration</TableHead>
					<TableHead>Price</TableHead>
					<TableHead>Active</TableHead>
					{canWrite && (
						<TableHead>
							<span className="sr-only">Actions</span>
						</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{services.map((service) => (
					<TableRow key={service.id}>
						<TableCell className="font-medium">
							<Link
								to="/$organizationSlug/services/$id"
								params={{ organizationSlug, id: service.id }}
								className="hover:underline"
							>
								{service.name}
							</Link>
						</TableCell>
						<TableCell>{formatDuration(service.durationMinutes)}</TableCell>
						<TableCell>
							{formatMinorUnits(service.priceMinor, service.currency)}
						</TableCell>
						<TableCell>
							{canWrite ? (
								<Switch
									checked={service.isActive}
									onCheckedChange={(isActive) =>
										toggle.mutate({ id: service.id, isActive })
									}
									aria-label={`${service.name} is bookable`}
								/>
							) : (
								<Badge variant={service.isActive ? "secondary" : "outline"}>
									{service.isActive ? "Active" : "Inactive"}
								</Badge>
							)}
						</TableCell>
						{canWrite && (
							<TableCell className="w-0 text-right">
								<ServiceActions
									organizationId={organizationId}
									organizationSlug={organizationSlug}
									service={service}
									showEdit
								/>
							</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
