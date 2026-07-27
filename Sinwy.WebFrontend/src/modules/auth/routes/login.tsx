import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import useLogin from "#/modules/auth/lib/useLogin";
import { FormInput } from "#/shared/components/FormInput";
import { SubmitButton } from "#/shared/components/SubmitButton";
import { FieldError } from "#/shared/components/ui/field";
import { AuthLayout } from "../components/AuthLayout";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

export const Route = createFileRoute("/auth/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	component: LoginPage,
});

function LoginPage() {
	const { redirect } = Route.useSearch();
	const { form, serverError, callbackURL } = useLogin({
		redirectFrom: redirect,
	});

	return (
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
				<FormInput
					form={form}
					name="email"
					label="Email"
					type="email"
					autoComplete="email"
				/>

				<FormInput
					form={form}
					name="password"
					label="Password"
					type="password"
					autoComplete="current-password"
				/>

				{serverError && <FieldError>{serverError}</FieldError>}

				<SubmitButton form={form} label="Sign in" pendingLabel="Signing in…" />
			</form>

			<p className="my-4 text-center text-sm text-muted-foreground">or</p>

			<GoogleSignInButton callbackURL={callbackURL ?? "/auth/postlogin"} />

			<p className="mt-6 text-center text-sm text-muted-foreground">
				Don't have an account?{" "}
				<Link to="/auth/register" className="font-medium text-foreground">
					Sign up
				</Link>
			</p>
		</AuthLayout>
	);
}
