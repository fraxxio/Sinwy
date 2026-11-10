import {
	INVITATION_EXPIRY_DAYS,
	INVITE_ROLES,
	type InviteRole,
	ORG_ROLE_LABELS,
} from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import z from "zod";
import {
	invalidateTeam,
	inviteMember,
} from "#/modules/org-dashboard/lib/team-queries";
import { Button } from "#/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/shared/components/ui/dialog";
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { useAppForm } from "#/shared/lib/form";

const inviteSchema = z.object({
	email: z.email("Enter a valid email"),
	role: z.enum(INVITE_ROLES, "Choose a role"),
});

const ROLE_OPTIONS = [
	{ value: "staff", label: `${ORG_ROLE_LABELS.staff}: bookings and customers` },
	{ value: "admin", label: `${ORG_ROLE_LABELS.admin}: everything but billing` },
] satisfies { value: InviteRole; label: string }[];

export function InviteDialog({
	organizationId,
	seats,
	onClose,
}: {
	organizationId: string;
	seats: { used: number; limit: number };
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: { email: "", role: "staff" as string },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: inviteSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const body = inviteSchema.parse(value);
			try {
				await inviteMember(organizationId, body);
			} catch (error) {
				setServerError((error as Error).message);
				return;
			} finally {
				await invalidateTeam(queryClient, organizationId);
			}
			toast.add({
				type: "success",
				title: `Invitation sent to ${body.email}`,
				timeout: 4_000,
			});
			onClose();
		},
	});

	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(isSubmitting) => (
				<Dialog
					open
					onOpenChange={(open) => !open && !isSubmitting && onClose()}
				>
					<DialogContent className="sm:max-w-md">
						<form
							noValidate
							className="grid gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								void form.handleSubmit();
							}}
						>
							<DialogHeader>
								<DialogTitle>Invite a team member</DialogTitle>
								<DialogDescription>
									They get an email with a link that works for{" "}
									{INVITATION_EXPIRY_DAYS} days. {seats.used} of {seats.limit}{" "}
									seats used; a pending invitation takes one too.
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-2">
								<form.AppField name="email">
									{(field) => (
										<field.TextField
											label="Email"
											type="email"
											autoComplete="off"
										/>
									)}
								</form.AppField>
								<form.AppField name="role">
									{(field) => (
										<field.SelectField label="Role" options={ROLE_OPTIONS} />
									)}
								</form.AppField>
							</div>
							{serverError && <FieldError>{serverError}</FieldError>}
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									disabled={isSubmitting}
									onClick={onClose}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? "Sending…" : "Send invitation"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			)}
		</form.Subscribe>
	);
}
