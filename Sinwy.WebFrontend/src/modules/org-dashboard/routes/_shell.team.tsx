import { PLAN_LIMITS } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { UserPlusIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { InvitationsTable } from "#/modules/org-dashboard/components/team/InvitationsTable";
import { InviteDialog } from "#/modules/org-dashboard/components/team/InviteDialog";
import { MembersTable } from "#/modules/org-dashboard/components/team/MembersTable";
import { ORG_SECTIONS } from "#/modules/org-dashboard/lib/sections";
import { openInvitations, seatUsage } from "#/modules/org-dashboard/lib/team";
import {
	invitationsQuery,
	membersQuery,
} from "#/modules/org-dashboard/lib/team-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { UpgradeAction } from "#/shared/components/UpgradePrompt";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { useEntitlements } from "#/shared/lib/auth/entitlements";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/team",
)({
	beforeLoad: requirePermission(ORG_SECTIONS.team.permission),
	staticData: { crumb: "Team" },
	component: TeamPage,
});

function TeamPage() {
	const { organization, session } = Route.useRouteContext();
	const { plan } = useEntitlements();
	const members = useQuery(membersQuery(organization.id));
	const invitations = useQuery(invitationsQuery(organization.id));
	const [inviting, setInviting] = useState(false);

	const header = (action?: ReactNode) => (
		<PageHeader
			title="Team"
			description="The people who work in this organization."
			action={action}
		/>
	);

	if (members.isPending || invitations.isPending)
		return (
			<>
				{header()}
				<Skeleton className="h-48 rounded-xl" />
			</>
		);
	if (members.isError || invitations.isError)
		return (
			<>
				{header()}
				<FieldError>{(members.error ?? invitations.error)?.message}</FieldError>
			</>
		);

	const pending = openInvitations(invitations.data);
	const seats = seatUsage(members.data, invitations.data, plan);
	const canUpgrade = Object.values(PLAN_LIMITS).some(
		(limits) => limits.members > seats.limit,
	);

	return (
		<>
			{header(
				seats.full ? (
					<div className="flex shrink-0 items-center gap-3">
						<p className="text-muted-foreground text-sm">
							{canUpgrade
								? "No seats left on this plan."
								: "No seats left. Remove someone to invite more."}
						</p>
						{canUpgrade && <UpgradeAction />}
					</div>
				) : (
					<Button type="button" onClick={() => setInviting(true)}>
						<UserPlusIcon />
						Invite
					</Button>
				),
			)}

			<ContentBox className="gap-4 p-4">
				<div className="flex items-baseline justify-between gap-4">
					<h2 className="font-heading font-medium text-base">Members</h2>
					<p className="text-muted-foreground text-sm">
						{seats.used} of {seats.limit} seats used
					</p>
				</div>
				<MembersTable
					organizationId={organization.id}
					members={members.data}
					currentUserId={session.user.id}
				/>
			</ContentBox>

			{pending.length > 0 && (
				<ContentBox className="gap-4 p-4">
					<h2 className="font-heading font-medium text-base">
						Pending invitations
					</h2>
					<InvitationsTable
						organizationId={organization.id}
						invitations={pending}
					/>
				</ContentBox>
			)}

			{inviting && (
				<InviteDialog
					organizationId={organization.id}
					seats={seats}
					onClose={() => setInviting(false)}
				/>
			)}
		</>
	);
}
