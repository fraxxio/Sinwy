import type { OrganizationSummary } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2Icon } from "lucide-react";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import {
	closedOrganizationBadge,
	closedOrganizationReason,
	isLapsed,
	isOrganizationOpen,
	organizationsQuery,
	reactivationLink,
} from "#/shared/lib/organizations";
import { getPlanName } from "#/shared/lib/plans";

export const Route = createFileRoute("/account/_shell/organizations")({
	staticData: { crumb: "Organizations" },
	component: OrganizationsPage,
});

const createLink = (
	<Button nativeButton={false} render={<Link to="/organizations/new" />}>
		Create organization
	</Button>
);

function OrganizationsPage() {
	const {
		data: organizations,
		isPending,
		isError,
	} = useQuery(organizationsQuery);

	if (organizations?.length === 0)
		return (
			<>
				<PageHeader
					title="Organizations"
					description="Organizations you own or belong to."
				/>
				<EmptyState
					icon={<Building2Icon />}
					title="No organizations yet"
					description="Create an organization to take bookings, publish pages and get paid."
					action={createLink}
				/>
			</>
		);

	return (
		<>
			<PageHeader
				title="Organizations"
				description="Organizations you own or belong to."
				action={organizations && createLink}
			/>
			<ContentBox>
				{isPending ? (
					<Skeleton className="h-24" />
				) : isError ? (
					<FieldError>
						Couldn't load your organizations. Reload to retry.
					</FieldError>
				) : (
					<ul className="divide-y">
						{organizations.map((org) => (
							<OrganizationRow key={org.id} organization={org} />
						))}
					</ul>
				)}
			</ContentBox>
		</>
	);
}

function OrganizationRow({
	organization,
}: {
	organization: OrganizationSummary;
}) {
	const open = isOrganizationOpen(organization);
	const link = reactivationLink(organization);

	return (
		<li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
			<div className="grid gap-0.5 text-sm">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium">{organization.name}</span>
					<Badge variant="secondary">
						{organization.isOwner ? "Owner" : "Member"}
					</Badge>
					{open ? (
						<Badge variant="outline">
							{organization.plan ? getPlanName(organization.plan) : "Active"}
						</Badge>
					) : (
						<Badge variant={organization.deletesAt ? "destructive" : "outline"}>
							{closedOrganizationBadge(organization)}
						</Badge>
					)}
				</div>
				{!open && (
					<span className="text-xs text-muted-foreground">
						{closedOrganizationReason(organization)}
						{!link &&
							!organization.deletesAt &&
							(organization.suspended
								? ". Ask the owner to resume it."
								: ". Ask the owner to renew it.")}
					</span>
				)}
			</div>
			{open ? (
				<Button
					variant="outline"
					size="sm"
					nativeButton={false}
					render={
						<Link
							to="/$organizationSlug"
							params={{ organizationSlug: organization.slug }}
						/>
					}
				>
					Open
				</Button>
			) : link ? (
				<Button size="sm" nativeButton={false} render={<Link {...link} />}>
					{organization.suspended
						? "Resume"
						: isLapsed(organization)
							? "Renew plan"
							: "Choose a plan"}
				</Button>
			) : null}
		</li>
	);
}
