import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import useRegister, { PASSWORD_RULES } from "#/modules/auth/lib/useRegister";
import { FormInput } from "#/shared/components/FormInput";
import { SubmitButton } from "#/shared/components/SubmitButton";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { AuthLayout } from "../components/AuthLayout";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

export const Route = createFileRoute("/auth/register")({
	validateSearch: z.object({ source: z.string().optional() }),
	component: RegisterPage,
});

function RegisterPage() {
	const navigate = Route.useNavigate();
	const { source } = Route.useSearch();
	const {
		sentTo,
		serverError,
		form,
		callbackURL,
		shakeToken,
		cooldown,
		resend,
		reset,
	} = useRegister({ source });

	useEffect(() => {
		if (source !== undefined) navigate({ search: {}, replace: true });
	}, [source, navigate]);

	if (sentTo) {
		return (
			<AuthLayout>
				<div className="space-y-1.5 text-center">
					<h1 className="text-2xl font-bold tracking-tight">
						Check your inbox
					</h1>
					<p className="text-sm text-muted-foreground">
						We sent a verification link to {sentTo}. Click it to continue.
					</p>
				</div>

				{serverError && (
					<FieldError className="mt-4 justify-center">{serverError}</FieldError>
				)}

				<Button
					className="mt-6 w-full"
					onClick={() => void resend()}
					disabled={cooldown > 0}
				>
					{cooldown > 0 ? `Send again in ${cooldown}s` : "Send again"}
				</Button>
				<Button variant="outline" className="mt-2 w-full" onClick={reset}>
					Wrong email? Go back
				</Button>
			</AuthLayout>
		);
	}

	return (
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
				<FormInput
					form={form}
					name="name"
					label="Name"
					placeholder="Jordan Rivera"
					autoComplete="name"
					shakeToken={shakeToken}
				/>

				<FormInput
					form={form}
					name="email"
					label="Email"
					type="email"
					placeholder="you@example.com"
					autoComplete="email"
					description="We'll never share your email with anyone."
					shakeToken={shakeToken}
				/>

				<FormInput
					form={form}
					name="password"
					label="Password"
					type="password"
					placeholder="Create a strong password"
					autoComplete="new-password"
					description={PASSWORD_RULES}
					shakeToken={shakeToken}
				/>

				<FormInput
					form={form}
					name="confirmPassword"
					label="Confirm password"
					type="password"
					placeholder="Re-enter your password"
					autoComplete="new-password"
					shakeToken={shakeToken}
				/>

				{serverError && <FieldError>{serverError}</FieldError>}

				<SubmitButton
					form={form}
					label="Create account"
					pendingLabel="Creating account…"
				/>
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
	);
}
