import { PASSWORD_RULES, passwordSchema } from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { SettingsSection } from "#/modules/account-dashboard/components/settings/SettingsSection";
import {
	accountKeys,
	accountsQuery,
	hasCredentialAccount,
} from "#/modules/account-dashboard/lib/account-queries";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { toast } from "#/shared/components/ui/toast";
import { api } from "#/shared/lib/api";
import { authClient } from "#/shared/lib/auth/auth-client";
import { useAppForm } from "#/shared/lib/form";

const mismatch = {
	path: ["confirmPassword"],
	message: "Passwords do not match",
};

const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "Enter your current password"),
		newPassword: passwordSchema,
		confirmPassword: z.string(),
	})
	.refine((value) => value.newPassword === value.confirmPassword, mismatch);

const setPasswordFormSchema = z
	.object({ newPassword: passwordSchema, confirmPassword: z.string() })
	.refine((value) => value.newPassword === value.confirmPassword, mismatch);

export function PasswordSection() {
	const { data: accounts, isPending, isError } = useQuery(accountsQuery);

	return (
		<SettingsSection
			id="password"
			title="Password"
			description="Changing it signs you out everywhere else."
		>
			{isPending ? (
				<Skeleton className="h-40" />
			) : isError ? (
				<FieldError>
					Couldn't check how you sign in. Reload to retry.
				</FieldError>
			) : hasCredentialAccount(accounts) ? (
				<ChangePasswordForm />
			) : (
				<SetPasswordForm />
			)}
		</SettingsSection>
	);
}

function ChangePasswordForm() {
	const queryClient = useQueryClient();
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			confirmPassword: "",
		},
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: changePasswordSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error } = await authClient.changePassword({
				currentPassword: value.currentPassword,
				newPassword: value.newPassword,
				revokeOtherSessions: true,
			});
			if (error) {
				setServerError(error.message ?? "Couldn't change your password");
				return;
			}
			form.reset();
			// every other session is revoked and this one gets a new token
			await queryClient.invalidateQueries({ queryKey: accountKeys.sessions });
			toast.add({
				type: "success",
				title: "Password changed",
				description: "Other devices have been signed out.",
				timeout: 5_000,
			});
		},
	});

	return (
		<form
			noValidate
			className="grid gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.AppField name="currentPassword">
				{(field) => (
					<field.TextField
						label="Current password"
						type="password"
						autoComplete="current-password"
					/>
				)}
			</form.AppField>
			<form.AppField name="newPassword">
				{(field) => (
					<field.TextField
						label="New password"
						type="password"
						autoComplete="new-password"
						description={PASSWORD_RULES}
					/>
				)}
			</form.AppField>
			<form.AppField name="confirmPassword">
				{(field) => (
					<field.TextField
						label="Confirm new password"
						type="password"
						autoComplete="new-password"
					/>
				)}
			</form.AppField>
			{serverError && <FieldError>{serverError}</FieldError>}
			<form.AppForm>
				<form.SubmitButton
					label="Change password"
					pendingLabel="Changing…"
					className="w-fit"
				/>
			</form.AppForm>
		</form>
	);
}

function SetPasswordForm() {
	const queryClient = useQueryClient();
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: { newPassword: "", confirmPassword: "" },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: setPasswordFormSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const res = await api("/user/password", {
				method: "POST",
				body: JSON.stringify({ newPassword: value.newPassword }),
			});
			if (!res.isSuccess) {
				setServerError(res.message);
				return;
			}
			await queryClient.invalidateQueries({ queryKey: accountKeys.accounts });
			toast.add({
				type: "success",
				title: "Password set",
				description: "You can now sign in with your email and password.",
				timeout: 5_000,
			});
		},
	});

	return (
		<form
			noValidate
			className="grid gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<p className="mb-2 text-sm text-muted-foreground">
				You sign in with Google. Add a password to sign in without it and to be
				able to disconnect Google.
			</p>
			<form.AppField name="newPassword">
				{(field) => (
					<field.TextField
						label="New password"
						type="password"
						autoComplete="new-password"
						description={PASSWORD_RULES}
					/>
				)}
			</form.AppField>
			<form.AppField name="confirmPassword">
				{(field) => (
					<field.TextField
						label="Confirm new password"
						type="password"
						autoComplete="new-password"
					/>
				)}
			</form.AppField>
			{serverError && <FieldError>{serverError}</FieldError>}
			<form.AppForm>
				<form.SubmitButton
					label="Set password"
					pendingLabel="Saving…"
					className="w-fit"
				/>
			</form.AppForm>
		</form>
	);
}
