import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PASSWORD_RULES } from "#/modules/auth/lib/useRegister";
import useResetPassword from "#/modules/auth/lib/useResetPassword";
import { FormInput } from "#/shared/components/FormInput";
import { SubmitButton } from "#/shared/components/SubmitButton";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { AuthLayout } from "../components/AuthLayout";

export const Route = createFileRoute("/auth/reset-password")({
	validateSearch: z.object({
		token: z.string().optional(),
		error: z.string().optional(),
	}),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const { token, error } = Route.useSearch();

	if (!token || error) return <ExpiredLink />;

	return <ResetPasswordForm token={token} />;
}

function ExpiredLink() {
	return (
		<AuthLayout>
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold tracking-tight">Link expired</h1>
				<p className="text-sm text-muted-foreground">
					This reset link is no longer valid. Request a new one to continue.
				</p>
			</div>
			<Button
				className="mt-6 w-full"
				render={<Link to="/auth/forgot-password" />}
			>
				Request a new link
			</Button>
		</AuthLayout>
	);
}

function ResetPasswordForm({ token }: { token: string }) {
	const { form, serverError, tokenRejected } = useResetPassword({ token });

	if (tokenRejected) return <ExpiredLink />;

	return (
		<AuthLayout>
			<div className="mb-6 space-y-1.5">
				<h1 className="text-2xl font-bold tracking-tight">
					Set a new password
				</h1>
				<p className="text-sm text-muted-foreground">
					You'll be signed out everywhere else once it's changed
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
					name="password"
					label="New password"
					type="password"
					placeholder="Create a strong password"
					autoComplete="new-password"
					description={PASSWORD_RULES}
				/>

				<FormInput
					form={form}
					name="confirmPassword"
					label="Confirm password"
					type="password"
					placeholder="Re-enter your password"
					autoComplete="new-password"
				/>

				{serverError && <FieldError>{serverError}</FieldError>}

				<SubmitButton
					form={form}
					label="Reset password"
					pendingLabel="Resetting…"
				/>
			</form>
		</AuthLayout>
	);
}
