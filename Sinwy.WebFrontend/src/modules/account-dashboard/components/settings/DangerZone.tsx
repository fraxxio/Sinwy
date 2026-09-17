import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SettingsSection } from "#/modules/account-dashboard/components/settings/SettingsSection";
import {
	deletionPreviewQuery,
	type SessionUser,
} from "#/modules/account-dashboard/lib/account-queries";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/shared/components/ui/alert-dialog";
import { Button } from "#/shared/components/ui/button";
import { FieldError, FieldLabel } from "#/shared/components/ui/field";
import { Input } from "#/shared/components/ui/input";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { authClient } from "#/shared/lib/auth/auth-client";

const sameEmail = (a: string, b: string) =>
	a.trim().toLowerCase() === b.trim().toLowerCase();

export function DangerZone({ user }: { user: SessionUser }) {
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const [sent, setSent] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const preview = useQuery({ ...deletionPreviewQuery, enabled: open });
	const orgs = preview.data?.soleOwnedOrganizations ?? [];
	const canConfirm = preview.isSuccess && sameEmail(typed, user.email) && !busy;

	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) return;
		setTyped("");
		setSent(false);
		setError(null);
	};

	const confirm = async () => {
		setError(null);
		setBusy(true);
		const { error } = await authClient.deleteUser({
			callbackURL: "/auth/goodbye",
		});
		setBusy(false);
		if (error) {
			setError(error.message ?? "Couldn't start account deletion");
			return;
		}
		setSent(true);
	};

	return (
		<SettingsSection
			id="danger"
			title="Delete account"
			description="Permanently removes your profile, bookings and memberships. This cannot be undone."
			className="ring-1 ring-destructive/30"
		>
			<AlertDialog open={open} onOpenChange={onOpenChange}>
				<AlertDialogTrigger render={<Button variant="destructive" />}>
					Delete my account
				</AlertDialogTrigger>
				<AlertDialogContent>
					{sent ? (
						<>
							<AlertDialogHeader>
								<AlertDialogTitle>Check your email</AlertDialogTitle>
								<AlertDialogDescription>
									We sent a confirmation link to {user.email}. Your account is
									deleted only once you open it; ignore the email to keep it.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Close</AlertDialogCancel>
							</AlertDialogFooter>
						</>
					) : (
						<>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete your account?</AlertDialogTitle>
								<AlertDialogDescription>
									We'll email you a link to confirm. Everything tied to your
									account is removed for good once you open it.
								</AlertDialogDescription>
							</AlertDialogHeader>

							{preview.isPending ? (
								<Skeleton className="h-12" />
							) : preview.isError ? (
								<FieldError>
									Couldn't check your organizations. Close and try again.
								</FieldError>
							) : (
								orgs.length > 0 && (
									<div className="grid gap-2 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
										<p className="font-medium">
											You are the only owner of{" "}
											{orgs.length === 1
												? "this organization"
												: "these organizations"}
											. {orgs.length === 1 ? "It" : "They"} will be deleted
											along with any active subscription:
										</p>
										<ul className="list-inside list-disc">
											{orgs.map((org) => (
												<li key={org.id}>{org.name}</li>
											))}
										</ul>
									</div>
								)
							)}

							<div className="grid gap-2">
								<FieldLabel htmlFor="confirm-email">
									Type <span className="font-mono">{user.email}</span> to
									continue
								</FieldLabel>
								<Input
									id="confirm-email"
									type="email"
									autoComplete="off"
									value={typed}
									onChange={(e) => setTyped(e.target.value)}
								/>
							</div>

							{error && <FieldError>{error}</FieldError>}

							<AlertDialogFooter>
								<AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									disabled={!canConfirm}
									onClick={() => void confirm()}
								>
									{busy ? "Sending…" : "Send confirmation email"}
								</AlertDialogAction>
							</AlertDialogFooter>
						</>
					)}
				</AlertDialogContent>
			</AlertDialog>
		</SettingsSection>
	);
}
