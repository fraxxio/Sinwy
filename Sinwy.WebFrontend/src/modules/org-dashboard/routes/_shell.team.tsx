import { createFileRoute } from "@tanstack/react-router";
import { UsersRoundIcon } from "lucide-react";
import { ORG_SECTIONS } from "#/modules/org-dashboard/lib/sections";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute("/$organizationSlug/_shell/team")({
	beforeLoad: requirePermission(ORG_SECTIONS.team.permission),
	staticData: { crumb: "Team" },
	component: TeamPage,
});

function TeamPage() {
	return (
		<>
			<PageHeader
				title="Team"
				description="The people who work in this organization."
			/>
			<EmptyState
				icon={<UsersRoundIcon />}
				title="Just you so far"
				description="Invite the rest of your team so they can manage bookings with you."
			/>
		</>
	);
}
