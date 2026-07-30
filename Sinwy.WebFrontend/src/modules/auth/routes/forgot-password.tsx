import { createFileRoute } from "@tanstack/react-router";
import ForgotPasswordForm from "#/modules/auth/components/ForgotPasswordForm";
import SentResetEmail from "#/modules/auth/components/SentResetEmail";
import useForgotPassword from "#/modules/auth/lib/useForgotPassword";

export const Route = createFileRoute("/auth/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const { form, sentTo, serverError, cooldown, resend } = useForgotPassword();

	if (sentTo) {
		return (
			<SentResetEmail
				sentTo={sentTo}
				serverError={serverError}
				cooldown={cooldown}
				resend={resend}
			/>
		);
	}

	return <ForgotPasswordForm form={form} serverError={serverError} />;
}
