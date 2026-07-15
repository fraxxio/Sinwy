import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { FormInput } from "#/shared/components/FormInput";
import { SubmitButton } from "#/shared/components/SubmitButton";
import { FieldError } from "#/shared/components/ui/field";
import { AuthLayout } from "../components/AuthLayout";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/auth/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	component: LoginPage,
});

const loginSchema = z.object({
	email: z.email("Enter a valid email"),
	password: z.string().min(1, "Password is required"),
});

function LoginPage() {
	const navigate = useNavigate();
	const { redirect } = Route.useSearch();
	// only same-origin paths — an absolute or `//host` URL would be an open redirect
	const returnTo =
		redirect?.startsWith("/") && !redirect.startsWith("//")
			? redirect
			: undefined;
	const [serverError, setServerError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { email: "", password: "" },
		validators: { onSubmit: loginSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error } = await authClient.signIn.email(value);
			if (error) {
				setServerError(error.message ?? "Sign in failed");
				return;
			}
			if (returnTo) await navigate({ href: returnTo });
			else await navigate({ to: "/auth/postlogin" });
		},
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
				className="grid gap-4"
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

			<GoogleSignInButton callbackURL={returnTo ?? "/auth/postlogin"} />

			<p className="mt-6 text-center text-sm text-muted-foreground">
				Don't have an account?{" "}
				<Link to="/auth/register" className="font-medium text-foreground">
					Sign up
				</Link>
			</p>
		</AuthLayout>
	);
}
