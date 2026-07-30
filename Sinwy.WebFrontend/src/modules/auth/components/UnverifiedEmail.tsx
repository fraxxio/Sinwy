import { AuthLayout } from "#/modules/auth/components/AuthLayout";
import { loginFormOpts } from "#/modules/auth/lib/useLogin";
import { Button } from "#/shared/components/ui/button";
import { withForm } from "#/shared/lib/form";

type Props = {
	unverifiedEmail: string;
	clearUnverified: () => void;
};

const UnverifiedEmail = withForm({
	...loginFormOpts,
	props: {} as Props,
	render: ({ form, unverifiedEmail, clearUnverified }) => (
		<AuthLayout>
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold tracking-tight">Verify your email</h1>
				<p className="text-sm text-muted-foreground">
					Your email is not verified. We sent a verification link to{" "}
					<b>{unverifiedEmail}</b>. Click it to continue.
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

			<Button
				type="button"
				variant="ghost"
				className="mt-6 mx-auto flex w-fit"
				onClick={clearUnverified}
			>
				Back to sign in
			</Button>
		</AuthLayout>
	),
});

export default UnverifiedEmail;
