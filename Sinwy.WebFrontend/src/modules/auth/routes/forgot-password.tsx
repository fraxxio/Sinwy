import { createFileRoute, Link } from "@tanstack/react-router";
import useForgotPassword from "#/modules/auth/lib/useForgotPassword";
import { FormInput } from "#/shared/components/FormInput";
import { SubmitButton } from "#/shared/components/SubmitButton";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { AuthLayout } from "../components/AuthLayout";

export const Route = createFileRoute("/auth/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const { form, sentTo, serverError, cooldown, resend } = useForgotPassword();

	if (sentTo) {
		return (
			<AuthLayout>
				<div className="space-y-1.5 text-center">
					<h1 className="text-2xl font-bold tracking-tight">
						Check your inbox
					</h1>
					<p className="text-sm text-muted-foreground">
						If an account exists for {sentTo}, we sent it a reset link. It
						expires in an hour.
					</p>
				</div>

				{serverError && (
					<FieldError className="mt-4 justify-center">{serverError}</FieldError>
				)}

				<Button
					className="mt-6 w-full"
					onClick={resend}
					disabled={cooldown > 0}
				>
					{cooldown > 0 ? `Send again in ${cooldown}s` : "Send again"}
				</Button>
				<Button
					variant="outline"
					className="mt-2 w-full"
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
				<h1 className="text-2xl font-bold tracking-tight">Forgot password</h1>
				<p className="text-sm text-muted-foreground">
					Enter your email and we'll send you a reset link
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
					placeholder="you@example.com"
					autoComplete="email"
				/>

				{serverError && <FieldError>{serverError}</FieldError>}

				<SubmitButton
					form={form}
					label="Send reset link"
					pendingLabel="Sending…"
				/>
			</form>

			<p className="mt-6 text-center text-sm text-muted-foreground">
				Remembered it?{" "}
				<Link to="/auth/login" className="font-medium text-foreground">
					Sign in
				</Link>
			</p>
		</AuthLayout>
	);
}
