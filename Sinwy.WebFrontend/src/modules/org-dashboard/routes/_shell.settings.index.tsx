import { hasPermission } from "@sinwy/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TransferSection } from "#/modules/org-dashboard/components/TransferSection";
import { ContentBox } from "#/shared/components/ContentBox";
import { SettingsSection } from "#/shared/components/SettingsSection";
import { Button } from "#/shared/components/ui/button";
import { useEntitlements } from "#/shared/lib/auth/entitlements";
import { getPlanName } from "#/shared/lib/plans";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/settings/",
)({
	component: SettingsPage,
});

function SettingsPage() {
	const { organization, member } = Route.useRouteContext();
	const { plan } = useEntitlements();
	// billing:manage is the owner's alone; the plan and a transfer are theirs
	const isOwner = hasPermission(member.roles, "billing:manage");

	return (
		<ContentBox className="divide-y">
			<SettingsSection
				id="plan"
				title="Plan"
				description={
					plan
						? `${organization.name} runs on the ${getPlanName(plan)} plan.`
						: "The plan's details aren't available right now."
				}
				action={
					isOwner && (
						<Button
							variant="outline"
							size="sm"
							nativeButton={false}
							render={<Link to="/account/billing" />}
						>
							Manage billing
						</Button>
					)
				}
			/>
			{isOwner && (
				<TransferSection
					organizationId={organization.id}
					organizationName={organization.name}
				/>
			)}
		</ContentBox>
	);
}
