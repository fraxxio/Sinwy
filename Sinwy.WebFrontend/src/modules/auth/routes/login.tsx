import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { FormInput } from "#/shared/components/FormInput";
import { Button } from "#/shared/components/ui/button";
import { AuthLayout } from "../components/AuthLayout";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/auth/login")({ component: LoginPage });

const loginSchema = z.object({
	email: z.email("Enter a valid email"),
	password: z.string().min(1, "Password is required"),
});

function LoginPage() {
	const navigate = useNavigate();
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
			await navigate({ to: "/" });
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

				{serverError && (
					<p className="text-sm text-destructive">{serverError}</p>
				)}

				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" className="w-full" disabled={isSubmitting}>
							{isSubmitting ? "Signing in…" : "Sign in"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<Button
				type="button"
				variant="outline"
				className="mt-3 w-full"
				onClick={() => {
					void authClient.signIn.social({
						provider: "google",
						callbackURL: "/",
					});
				}}
			>
				Continue with Google
			</Button>

			<p className="mt-6 text-center text-sm text-muted-foreground">
				Don't have an account?{" "}
				<Link to="/auth/register" className="font-medium text-foreground">
					Sign up
				</Link>
			</p>
		</AuthLayout>
	);
}
