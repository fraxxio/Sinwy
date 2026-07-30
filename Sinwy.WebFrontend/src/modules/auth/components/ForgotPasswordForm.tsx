import { Link } from "@tanstack/react-router";
import { AuthLayout } from "#/modules/auth/components/AuthLayout";
import { forgotPasswordFormOpts } from "#/modules/auth/lib/useForgotPassword";
import { FieldError } from "#/shared/components/ui/field";
import { withForm } from "#/shared/lib/form";

type Props = {
	serverError: string | null;
};

const ForgotPasswordForm = withForm({
	...forgotPasswordFormOpts,
	props: {} as Props,
	render: ({ form, serverError }) => (
		<AuthLayout>
			<div className="mb-6 space-y-1.5">
				<h1 className="text-2xl font-bold tracking-tight">Forgot password</h1>
				<p className="text-sm text-muted-foreground">
					Enter your email and we'll send you a reset link
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
				<form.AppField name="email">
					{(field) => (
						<field.TextField
							label="Email"
							type="email"
							placeholder="you@example.com"
							autoComplete="email"
						/>
					)}
				</form.AppField>

				{serverError && <FieldError>{serverError}</FieldError>}

				<form.AppForm>
					<form.SubmitButton label="Send reset link" pendingLabel="Sending…" />
				</form.AppForm>
			</form>

			<p className="mt-6 text-center text-sm text-muted-foreground">
				Remembered it?{" "}
				<Link to="/auth/login" className="font-medium text-foreground">
					Sign in
				</Link>
			</p>
		</AuthLayout>
	),
});

export default ForgotPasswordForm;
