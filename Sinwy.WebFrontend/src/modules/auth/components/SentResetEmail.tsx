import { Link } from "@tanstack/react-router";
import { AuthLayout } from "#/modules/auth/components/AuthLayout";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";

type Props = {
	sentTo: string;
	serverError: string | null;
	cooldown: number;
	resend: () => void;
};

const SentResetEmail = ({ sentTo, serverError, cooldown, resend }: Props) => {
	return (
		<AuthLayout>
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold tracking-tight">Check your inbox</h1>
				<p className="text-sm text-muted-foreground">
					If an account exists for {sentTo}, we sent it a reset link. It expires
					in an hour.
				</p>
			</div>

			{serverError && (
				<FieldError className="mt-4 justify-center">{serverError}</FieldError>
			)}

			<Button className="mt-6 w-full" onClick={resend} disabled={cooldown > 0}>
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
};

export default SentResetEmail;
