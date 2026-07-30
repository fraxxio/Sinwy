import { AuthLayout } from "#/modules/auth/components/AuthLayout";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";

type Props = {
	sentTo: string | null;
	serverError: string | null;
	resendCooldown: number;
	resend: () => Promise<void>;
	reset: () => void;
};

const SentRegisterEmail = ({
	sentTo,
	serverError,
	resendCooldown,
	resend,
	reset,
}: Props) => {
	return (
		<AuthLayout>
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold tracking-tight">Check your inbox</h1>
				<p className="text-sm text-muted-foreground">
					We sent a verification link to <b>{sentTo}</b>. Click it to continue.
				</p>
			</div>

			{serverError && (
				<FieldError className="mt-4 justify-center">{serverError}</FieldError>
			)}

			<Button
				className="mt-6 w-full"
				onClick={() => void resend()}
				disabled={resendCooldown > 0}
			>
				{resendCooldown > 0 ? `Send again in ${resendCooldown}s` : "Send again"}
			</Button>
			<Button variant="outline" className="mt-6 w-full" onClick={reset}>
				Wrong email? Go back
			</Button>
		</AuthLayout>
	);
};

export default SentRegisterEmail;
