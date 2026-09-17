import { PROFILE_LIMITS, profileSchema } from "@sinwy/shared";
import { revalidateLogic } from "@tanstack/react-form";
import { useState } from "react";
import { AvatarUpload } from "#/modules/account-dashboard/components/settings/AvatarUpload";
import { SettingsSection } from "#/modules/account-dashboard/components/settings/SettingsSection";
import type { SessionUser } from "#/modules/account-dashboard/lib/account-queries";
import { FieldError } from "#/shared/components/ui/field";
import { toast } from "#/shared/components/ui/toast";
import { authClient } from "#/shared/lib/auth/auth-client";
import { useAppForm } from "#/shared/lib/form";

export function ProfileSection({ user }: { user: SessionUser }) {
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useAppForm({
		defaultValues: { name: user.name },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: profileSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error } = await authClient.updateUser({ name: value.name });
			if (error) {
				setServerError(error.message ?? "Couldn't save your profile");
				return;
			}
			form.reset(value);
			toast.add({ type: "success", title: "Profile saved", timeout: 4_000 });
		},
	});

	return (
		<SettingsSection
			id="profile"
			title="Profile"
			description="How you appear to organizations you book with and teams you belong to."
		>
			<div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:gap-10">
				<AvatarUpload user={user} />
				<form
					noValidate
					className="grid gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						void form.handleSubmit();
					}}
				>
					<form.AppField name="name">
						{(field) => (
							<field.TextField
								label="Name"
								autoComplete="name"
								maxLength={PROFILE_LIMITS.name}
							/>
						)}
					</form.AppField>

					{serverError && <FieldError>{serverError}</FieldError>}

					<form.AppForm>
						<form.SubmitButton
							label="Save"
							pendingLabel="Saving…"
							className="w-fit"
						/>
					</form.AppForm>
				</form>
			</div>
		</SettingsSection>
	);
}
