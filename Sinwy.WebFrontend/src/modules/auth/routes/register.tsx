import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { FormInput } from "#/shared/components/FormInput";
import { SubmitButton } from "#/shared/components/SubmitButton";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { AuthLayout } from "../components/AuthLayout";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
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
	const navigate = Route.useNavigate();
	const { source } = Route.useSearch();
	const [savedSource] = useState(source);
	const callbackURL =
		savedSource === "business" ? "/organizations/new" : "/auth/postlogin";
	const [serverError, setServerError] = useState<string | null>(null);
	const [sentTo, setSentTo] = useState<string | null>(null);

	useEffect(() => {
		if (source !== undefined) navigate({ search: {}, replace: true });
	}, [source, navigate]);

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

				{serverError && <FieldError>{serverError}</FieldError>}

				<SubmitButton
					form={form}
					label="Create account"
					pendingLabel="Creating account…"
				/>
			</form>

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
