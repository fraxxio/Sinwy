import { Link } from "@tanstack/react-router";
import { AuthLayout } from "#/modules/auth/components/AuthLayout";
import { GoogleSignInButton } from "#/modules/auth/components/GoogleSignInButton";
import { loginFormOpts } from "#/modules/auth/lib/useLogin";
import { FieldError } from "#/shared/components/ui/field";
import { withForm } from "#/shared/lib/form";

type Props = {
	callbackURL: string;
	serverError: string | null;
};

const LoginForm = withForm({
	...loginFormOpts,
	props: {} as Props,
	render: ({ form, callbackURL, serverError }) => (
		<AuthLayout>
			<div className="mb-6 space-y-1.5">
				<h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
				<p className="text-sm text-muted-foreground">
					Sign in to your account to continue
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
						<field.TextField label="Email" type="email" autoComplete="email" />
					)}
				</form.AppField>

				<form.AppField name="password">
					{(field) => (
						<field.TextField
							label="Password"
							type="password"
							autoComplete="current-password"
						/>
					)}
				</form.AppField>

				<Link
					to="/auth/forgot-password"
					className="justify-self-end text-sm text-muted-foreground"
				>
					Forgot password?
				</Link>

				{serverError && <FieldError>{serverError}</FieldError>}

				<form.AppForm>
					<form.SubmitButton label="Sign in" pendingLabel="Signing in…" />
				</form.AppForm>
			</form>

			<p className="my-4 text-center text-sm text-muted-foreground">or</p>

			<GoogleSignInButton callbackURL={callbackURL} />

			<p className="mt-6 text-center text-sm text-muted-foreground">
				Don't have an account?{" "}
				<Link to="/auth/register" className="font-medium text-foreground">
					Sign up
				</Link>
			</p>
		</AuthLayout>
	),
});

export default LoginForm;
