import { hasPermission } from "@sinwy/shared";
import { createFileRoute } from "@tanstack/react-router";
import { Settings2Icon } from "lucide-react";
import { TransferSection } from "#/modules/org-dashboard/components/TransferSection";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	const { organization, member } = Route.useRouteContext();
	// billing:manage is the owner's alone, and a transfer moves the billing
	const isOwner = hasPermission(member.roles, "billing:manage");

	return (
		<>
			<PageHeader
				title="Settings"
				description="Your organization's profile and general configuration."
			/>
			{isOwner ? (
				<ContentBox className="divide-y">
					<TransferSection
						organizationId={organization.id}
						organizationName={organization.name}
					/>
				</ContentBox>
			) : (
				<EmptyState
					icon={<Settings2Icon />}
					title="Nothing to configure yet"
					description="General organization settings will live here."
				/>
			)}
		</>
	);
}
