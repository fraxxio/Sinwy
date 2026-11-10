import { type InviteRole, ORG_ROLE_LABELS } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EllipsisIcon, UserMinusIcon, UserRoundCogIcon } from "lucide-react";
import { useState } from "react";
import {
	canManageMember,
	type TeamMember,
} from "#/modules/org-dashboard/lib/team";
import {
	invalidateTeam,
	removeMember,
	updateMemberRole,
} from "#/modules/org-dashboard/lib/team-queries";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/shared/components/ui/alert-dialog";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/shared/components/ui/dropdown-menu";
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

export function MembersTable({
	organizationId,
	members,
	currentUserId,
}: {
	organizationId: string;
	members: TeamMember[];
	currentUserId: string;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Email</TableHead>
					<TableHead>Role</TableHead>
					<TableHead>Joined</TableHead>
					<TableHead>
						<span className="sr-only">Actions</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{members.map((member) => (
					<TableRow key={member.id}>
						<TableCell className="font-medium">
							{member.name}
							{member.userId === currentUserId && (
								<span className="text-muted-foreground"> (you)</span>
							)}
						</TableCell>
						<TableCell>{member.email}</TableCell>
						<TableCell>
							<Badge variant="secondary">{ORG_ROLE_LABELS[member.role]}</Badge>
						</TableCell>
						<TableCell>{formatDay(member.joinedAt)}</TableCell>
						<TableCell className="w-0 text-right">
							{canManageMember(member, currentUserId) && (
								<MemberActions
									organizationId={organizationId}
									member={member}
								/>
							)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

type Confirm = { kind: "role"; role: InviteRole } | { kind: "remove" };

function MemberActions({
	organizationId,
	member,
}: {
	organizationId: string;
	member: TeamMember;
}) {
	const queryClient = useQueryClient();
	const [confirm, setConfirm] = useState<Confirm | null>(null);
	const nextRole: InviteRole = member.role === "admin" ? "staff" : "admin";

	const action = useMutation({
		mutationFn: async (chosen: Confirm) =>
			chosen.kind === "role"
				? updateMemberRole(organizationId, member.id, chosen.role)
				: removeMember(organizationId, member.id),
		onSuccess: (_, chosen) => {
			setConfirm(null);
			toast.add({
				type: "success",
				title:
					chosen.kind === "role"
						? `${member.name} is now ${ORG_ROLE_LABELS[chosen.role].toLowerCase()}`
						: `${member.name} removed`,
				timeout: 4_000,
			});
		},
		onSettled: () => invalidateTeam(queryClient, organizationId),
	});

	const open = (next: Confirm) => {
		action.reset();
		setConfirm(next);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={`Actions for ${member.name}`}
						/>
					}
				>
					<EllipsisIcon />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-fit">
					<DropdownMenuItem
						onClick={() => open({ kind: "role", role: nextRole })}
					>
						<UserRoundCogIcon />
						Make {ORG_ROLE_LABELS[nextRole].toLowerCase()}
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onClick={() => open({ kind: "remove" })}
					>
						<UserMinusIcon />
						Remove
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={confirm !== null}
				onOpenChange={(next) => !next && !action.isPending && setConfirm(null)}
			>
				{confirm && (
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{confirm.kind === "role"
									? `Make ${member.name} ${ORG_ROLE_LABELS[confirm.role].toLowerCase()}?`
									: `Remove ${member.name}?`}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{confirm.kind === "remove"
									? "They lose access to this organization right away and free a seat. You can invite them again later."
									: confirm.role === "admin"
										? "Admins manage everything but billing, including the team."
										: "Staff work with bookings and customers, and only view services and pages."}
							</AlertDialogDescription>
						</AlertDialogHeader>
						{action.isError && <FieldError>{action.error.message}</FieldError>}
						<AlertDialogFooter>
							<AlertDialogCancel disabled={action.isPending}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								variant={confirm.kind === "remove" ? "destructive" : "default"}
								disabled={action.isPending}
								onClick={() => action.mutate(confirm)}
							>
								{action.isPending
									? "Saving…"
									: confirm.kind === "remove"
										? "Remove"
										: "Change role"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				)}
			</AlertDialog>
		</>
	);
}
