import { AuthLayout } from "#/modules/auth/components/AuthLayout";
import ExpiredPasswordLink from "#/modules/auth/components/ExpiredPasswordLink";
import { PASSWORD_RULES } from "#/modules/auth/lib/useRegister";
import useResetPassword from "#/modules/auth/lib/useResetPassword";
import { FieldError } from "#/shared/components/ui/field";

type Props = {
	token: string;
};

const ResetPasswordForm = ({ token }: Props) => {
	const { form, serverError, tokenRejected } = useResetPassword({ token });

	if (tokenRejected) return <ExpiredPasswordLink />;

	return (
		<AuthLayout>
			<div className="mb-6 space-y-1.5">
				<h1 className="text-2xl font-bold tracking-tight">
					Set a new password
				</h1>
				<p className="text-sm text-muted-foreground">
					You'll be signed out everywhere else once it's changed
				</p>
			</div>

			<form
				noValidate
				className="grid gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					void form.handleSubmit();
				}}
			>
				<form.AppField name="password">
					{(field) => (
						<field.TextField
							label="New password"
							type="password"
							placeholder="Create a strong password"
							autoComplete="new-password"
							description={PASSWORD_RULES}
						/>
					)}
				</form.AppField>

				<form.AppField name="confirmPassword">
					{(field) => (
						<field.TextField
							label="Confirm password"
							type="password"
							placeholder="Re-enter your password"
							autoComplete="new-password"
						/>
					)}
				</form.AppField>

				{serverError && <FieldError>{serverError}</FieldError>}

				<form.AppForm>
					<form.SubmitButton label="Reset password" pendingLabel="Resetting…" />
				</form.AppForm>
			</form>
		</AuthLayout>
	);
};

export default ResetPasswordForm;
