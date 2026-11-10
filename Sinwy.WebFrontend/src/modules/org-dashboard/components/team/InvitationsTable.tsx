import { isInviteRole, ORG_ROLE_LABELS } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TeamInvitation } from "#/modules/org-dashboard/lib/team";
import {
	cancelInvitation,
	invalidateTeam,
	inviteMember,
} from "#/modules/org-dashboard/lib/team-queries";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/shared/components/ui/table";
import { toast } from "#/shared/components/ui/toast";
import { formatDay } from "#/shared/lib/date";

export function InvitationsTable({
	organizationId,
	invitations,
}: {
	organizationId: string;
	invitations: TeamInvitation[];
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Email</TableHead>
					<TableHead>Role</TableHead>
					<TableHead>Expires</TableHead>
					<TableHead>
						<span className="sr-only">Actions</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{invitations.map((invitation) => (
					<InvitationRow
						key={invitation.id}
						organizationId={organizationId}
						invitation={invitation}
					/>
				))}
			</TableBody>
		</Table>
	);
}

function InvitationRow({
	organizationId,
	invitation,
}: {
	organizationId: string;
	invitation: TeamInvitation;
}) {
	const queryClient = useQueryClient();
	const role = isInviteRole(invitation.role) ? invitation.role : null;

	const action = useMutation({
		mutationFn: async (kind: "resend" | "revoke") => {
			if (kind === "revoke") return await cancelInvitation(invitation.id);
			if (!role) throw new Error("Revoke this invitation and send a new one.");
			return await inviteMember(organizationId, {
				email: invitation.email,
				role,
				resend: true,
			});
		},
		onSuccess: (_, kind) => {
			if (kind === "resend")
				toast.add({
					type: "success",
					title: `Invitation resent to ${invitation.email}`,
					timeout: 4_000,
				});
		},
		onSettled: () => invalidateTeam(queryClient, organizationId),
	});

	return (
		<TableRow>
			<TableCell className="font-medium">
				{invitation.email}
				{action.isError && (
					<FieldError className="font-normal">
						{action.error.message}
					</FieldError>
				)}
			</TableCell>
			<TableCell>
				<Badge variant="outline">
					{role ? ORG_ROLE_LABELS[role] : invitation.role}
				</Badge>
			</TableCell>
			<TableCell>{formatDay(invitation.expiresAt)}</TableCell>
			<TableCell className="w-0">
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={action.isPending}
						onClick={() => action.mutate("resend")}
					>
						{action.isPending && action.variables === "resend"
							? "Resending…"
							: "Resend"}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={action.isPending}
						onClick={() => action.mutate("revoke")}
					>
						{action.isPending && action.variables === "revoke"
							? "Revoking…"
							: "Revoke"}
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}
