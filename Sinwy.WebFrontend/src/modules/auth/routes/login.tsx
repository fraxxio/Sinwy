import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import useLogin from "#/modules/auth/lib/useLogin";
import { FormInput } from "#/shared/components/FormInput";
import { SubmitButton } from "#/shared/components/SubmitButton";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { AuthLayout } from "../components/AuthLayout";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

export const Route = createFileRoute("/auth/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	component: LoginPage,
});

function LoginPage() {
	const { redirect } = Route.useSearch();
	const { form, serverError, callbackURL, unverifiedEmail, clearUnverified } =
		useLogin({
			redirectFrom: redirect,
		});

	if (unverifiedEmail) {
		return (
			<AuthLayout>
				<div className="space-y-1.5 text-center">
					<h1 className="text-2xl font-bold tracking-tight">
						Verify your email
					</h1>
					<p className="text-sm text-muted-foreground">
						We sent a verification link to {unverifiedEmail}. Click it to
						continue.
					</p>
				</div>
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button
							variant="outline"
							className="mt-6 w-full"
							disabled={isSubmitting}
							onClick={() => void form.handleSubmit()}
						>
							{isSubmitting ? "Sending…" : "Resend email"}
						</Button>
					)}
				</form.Subscribe>
				<button
					type="button"
					className="mt-4 w-full text-center text-sm text-muted-foreground"
					onClick={clearUnverified}
				>
					Back to sign in
				</button>
			</AuthLayout>
		);
	}

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

				<Link
					to="/auth/forgot-password"
					className="justify-self-end text-sm text-muted-foreground"
				>
					Forgot password?
				</Link>

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
