import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { FormInput } from "#/shared/components/FormInput";
import { Button } from "#/shared/components/ui/button";
import { AuthLayout } from "../components/AuthLayout";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/auth/register")({
	validateSearch: z.object({ source: z.string().optional() }),
	component: RegisterPage,
});

const registerSchema = z.object({
	name: z.string().min(1, "Name is required"),
	email: z.email("Enter a valid email"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

function RegisterPage() {
	const { source } = Route.useSearch();
	// business signups continue into org creation; the source lives only in the URL
	const callbackURL = source === "business" ? "/organizations/new" : "/";
	const [serverError, setServerError] = useState<string | null>(null);
	const [sentTo, setSentTo] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		validators: { onSubmit: registerSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error } = await authClient.signUp.email({
				...value,
				callbackURL,
			});
			if (error) {
				setServerError(error.message ?? "Sign up failed");
				return;
			}
			setSentTo(value.email);
		},
	});

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
				<Button
					variant="outline"
					className="mt-6 w-full"
					render={<Link to="/auth/login" />}
				>
					Back to sign in
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
				className="grid gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					void form.handleSubmit();
				}}
			>
				<FormInput form={form} name="name" label="Name" autoComplete="name" />

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
					autoComplete="new-password"
				/>

				{serverError && (
					<p className="text-sm text-destructive">{serverError}</p>
				)}

				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" className="w-full" disabled={isSubmitting}>
							{isSubmitting ? "Creating account…" : "Create account"}
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
						callbackURL,
					});
				}}
			>
				Continue with Google
			</Button>

			<p className="mt-6 text-center text-sm text-muted-foreground">
				Already have an account?{" "}
				<Link to="/auth/login" className="font-medium text-foreground">
					Sign in
				</Link>
			</p>
		</AuthLayout>
	);
}
