import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import LoginForm from "#/modules/auth/components/LoginForm";
import UnverifiedEmail from "#/modules/auth/components/UnverifiedEmail";
import useLogin from "#/modules/auth/lib/useLogin";

export const Route = createFileRoute("/auth/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	component: LoginPage,
});

function LoginPage() {
	const { redirect } = Route.useSearch();
	const { form, serverError, callbackURL, clearUnverified, unverifiedEmail } =
		useLogin({ redirectFrom: redirect });

	if (unverifiedEmail) {
		return (
			<UnverifiedEmail
				form={form}
				unverifiedEmail={unverifiedEmail}
				clearUnverified={clearUnverified}
			/>
		);
	}

	return (
		<LoginForm
			form={form}
			callbackURL={callbackURL ?? "/auth/postlogin"}
			serverError={serverError}
		/>
	);
}
