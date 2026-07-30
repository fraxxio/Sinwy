import { Link } from "@tanstack/react-router";
import { AuthLayout } from "#/modules/auth/components/AuthLayout";
import { GoogleSignInButton } from "#/modules/auth/components/GoogleSignInButton";
import {
	PASSWORD_RULES,
	registerFormOpts,
} from "#/modules/auth/lib/useRegister";
import { FieldError } from "#/shared/components/ui/field";
import { withForm } from "#/shared/lib/form";

type Props = {
	callbackURL: string;
	shakeToken: number;
	serverError: string | null;
};

const RegisterForm = withForm({
	...registerFormOpts,
	props: {} as Props,
	render: ({ form, callbackURL, shakeToken, serverError }) => (
		<AuthLayout>
			<div className="mb-6 space-y-1.5">
				<h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
				<p className="text-sm text-muted-foreground">
					Enter your details to get started
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
				<form.AppField name="name">
					{(field) => (
						<field.TextField
							label="Name"
							placeholder="Jordan Rivera"
							autoComplete="name"
							shakeToken={shakeToken}
						/>
					)}
				</form.AppField>

				<form.AppField name="email">
					{(field) => (
						<field.TextField
							label="Email"
							type="email"
							placeholder="you@example.com"
							autoComplete="email"
							description="We'll never share your email with anyone."
							shakeToken={shakeToken}
						/>
					)}
				</form.AppField>

				<form.AppField name="password">
					{(field) => (
						<field.TextField
							label="Password"
							type="password"
							placeholder="Create a strong password"
							autoComplete="new-password"
							description={PASSWORD_RULES}
							shakeToken={shakeToken}
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
							shakeToken={shakeToken}
						/>
					)}
				</form.AppField>

				{serverError && <FieldError>{serverError}</FieldError>}

				<form.AppForm>
					<form.SubmitButton
						label="Create account"
						pendingLabel="Creating account…"
					/>
				</form.AppForm>
			</form>

			<p className="my-4 text-center text-sm text-muted-foreground">or</p>

			<GoogleSignInButton callbackURL={callbackURL} />

			<p className="mt-6 text-center text-sm text-muted-foreground">
				Already have an account?{" "}
				<Link to="/auth/login" className="font-medium text-foreground">
					Sign in
				</Link>
			</p>
		</AuthLayout>
	),
});

export default RegisterForm;
