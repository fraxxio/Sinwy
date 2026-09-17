import { revalidateLogic } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";
import { SettingsSection } from "#/modules/account-dashboard/components/settings/SettingsSection";
import type { SessionUser } from "#/modules/account-dashboard/lib/account-queries";
import { Badge } from "#/shared/components/ui/badge";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { authClient } from "#/shared/lib/auth/auth-client";
import { useAppForm } from "#/shared/lib/form";

const CALLBACK_URL = "/account/settings?email=changed";

const changeEmailSchema = (current: string) =>
	z.object({
		newEmail: z
			.email("Enter a valid email")
			.refine((value) => value.toLowerCase() !== current.toLowerCase(), {
				message: "That is already your email",
			}),
	});

export function EmailSection({ user }: { user: SessionUser }) {
	const [serverError, setServerError] = useState<string | null>(null);
	const [sentTo, setSentTo] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: { newEmail: "" },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: changeEmailSchema(user.email) },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error } = await authClient.changeEmail({
				newEmail: value.newEmail,
				callbackURL: CALLBACK_URL,
			});
			if (error) {
				setServerError(error.message ?? "Couldn't start the email change");
				return;
			}
			setSentTo(value.newEmail);
		},
	});

	return (
		<SettingsSection
			id="email"
			title="Email"
			description="Where we send booking updates and security notices."
		>
			<div className="grid gap-4">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="font-medium">{user.email}</span>
					{user.emailVerified ? (
						<Badge variant="secondary">Verified</Badge>
					) : (
						<Badge variant="outline">Unverified</Badge>
					)}
				</div>

				{sentTo ? (
					<div className="grid gap-2 rounded-2xl border border-dashed p-4 text-sm">
						<p className="font-medium">Almost there</p>
						<p className="text-muted-foreground">
							Check your current inbox to approve the change, then the one at{" "}
							<span className="font-medium text-foreground">{sentTo}</span> to
							verify it. Your email stays as it is until both are done.
						</p>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="w-fit"
							onClick={() => {
								setSentTo(null);
								form.reset();
							}}
						>
							Use a different address
						</Button>
					</div>
				) : (
					<form
						noValidate
						className="grid gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							void form.handleSubmit();
						}}
					>
						<form.AppField name="newEmail">
							{(field) => (
								<field.TextField
									label="New email"
									type="email"
									autoComplete="email"
									placeholder="you@example.com"
									description="We'll ask you to confirm from both addresses."
								/>
							)}
						</form.AppField>

						{serverError && <FieldError>{serverError}</FieldError>}

						<form.AppForm>
							<form.SubmitButton
								label="Change email"
								pendingLabel="Sending…"
								className="w-fit"
							/>
						</form.AppForm>
					</form>
				)}
			</div>
		</SettingsSection>
	);
}
