import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2Icon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { Button } from "#/shared/components/ui/button";

export const Route = createFileRoute("/account/_shell/organizations")({
	staticData: { crumb: "Organizations" },
	component: OrganizationsPage,
});

function OrganizationsPage() {
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
				action={
					<Button render={<Link to="/organizations/new" />}>
						Create organization
					</Button>
				}
			/>
		</>
	);
}
