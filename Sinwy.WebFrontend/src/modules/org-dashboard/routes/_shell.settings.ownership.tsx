import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TransferSection } from "#/modules/org-dashboard/components/TransferSection";
import { DeleteOrganizationDialog } from "#/modules/organizations/components/DeleteOrganizationDialog";
import { ContentBox } from "#/shared/components/ContentBox";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/settings/ownership",
)({
	// billing:manage is the owner's alone
	beforeLoad: requirePermission("billing:manage"),
	staticData: { crumb: "Ownership & danger zone" },
	component: OwnershipPage,
});

function OwnershipPage() {
	const { organization } = Route.useRouteContext();
	const navigate = useNavigate();

	return (
		<ContentBox className="divide-y">
			<TransferSection
				organizationId={organization.id}
				organizationName={organization.name}
			/>
			<SettingsSection
				id="delete"
				title="Delete organization"
				description="Removes the organization with its pages, services, bookings and team. Your plan isn't affected."
			>
				<DeleteOrganizationDialog
					organization={organization}
					trigger={<Button variant="destructive" className="w-fit" />}
					onDeleted={() => navigate({ to: "/account/organizations" })}
				/>
			</SettingsSection>
		</ContentBox>
	);
}
