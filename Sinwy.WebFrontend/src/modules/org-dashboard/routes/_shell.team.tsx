import { createFileRoute } from "@tanstack/react-router";
import { UsersRoundIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";

export const Route = createFileRoute("/$organizationSlug/_shell/team")({
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
