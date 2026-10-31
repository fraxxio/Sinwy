import { hasPermission } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon, WrenchIcon } from "lucide-react";
import { ServicesTable } from "#/modules/org-dashboard/components/ServicesTable";
import { servicesQuery } from "#/modules/org-dashboard/lib/service-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

export const Route = createFileRoute("/$organizationSlug/_shell/services/")({
	component: ServicesPage,
});

function ServicesPage() {
	const { organization, member } = Route.useRouteContext();
	const canWrite = hasPermission(member.roles, "services:write");
	const services = useQuery(servicesQuery(organization.id));

	const createButton = (label: string) => (
		<Button
			nativeButton={false}
			render={
				<Link
					to="/$organizationSlug/services/new"
					params={{ organizationSlug: organization.slug }}
				/>
			}
		>
			<PlusIcon />
			{label}
		</Button>
	);

	const hasServices = !!services.data?.length;

	return (
		<>
			<PageHeader
				title="Services"
				description="What your organization offers and what it costs."
				action={canWrite && hasServices && createButton("New service")}
			/>
			{services.isPending ? (
				<Skeleton className="h-48 rounded-xl" />
			) : services.isError ? (
				<FieldError>{services.error.message}</FieldError>
			) : hasServices ? (
				<ContentBox className="p-4">
					<ServicesTable
						organizationId={organization.id}
						organizationSlug={organization.slug}
						services={services.data}
						canWrite={canWrite}
					/>
				</ContentBox>
			) : (
				<EmptyState
					icon={<WrenchIcon />}
					title="No services yet"
					description={
						canWrite
							? "Add the services you offer so customers can book them."
							: "Once an owner or admin adds services, they show up here."
					}
					action={canWrite && createButton("Create your first service")}
				/>
			)}
		</>
	);
}
