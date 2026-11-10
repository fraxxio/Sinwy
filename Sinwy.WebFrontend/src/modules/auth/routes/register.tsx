import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import RegisterForm from "#/modules/auth/components/RegisterForm";
import SentRegisterEmail from "#/modules/auth/components/SentRegisterEmail";
import { safeRedirect } from "#/modules/auth/lib/safe-redirect";
import useRegister from "#/modules/auth/lib/useRegister";

export const Route = createFileRoute("/auth/register")({
	validateSearch: z.object({
		source: z.string().optional(),
		redirect: z.string().optional(),
	}),
	component: RegisterPage,
});

function RegisterPage() {
	const navigate = Route.useNavigate();
	const { source, redirect } = Route.useSearch();
	const {
		sentTo,
		serverError,
		form,
		callbackURL,
		shakeToken,
		resendDooldown,
		resend,
		reset,
	} = useRegister({ source, redirect });

	useEffect(() => {
		if (source !== undefined)
			navigate({
				search: (prev) => ({ ...prev, source: undefined }),
				replace: true,
			});
	}, [source, navigate]);

	if (sentTo) {
		return (
			<SentRegisterEmail
				resend={resend}
				resendCooldown={resendDooldown}
				reset={reset}
				sentTo={sentTo}
				serverError={serverError}
			/>
		);
	}

	return (
		<RegisterForm
			form={form}
			shakeToken={shakeToken}
			callbackURL={callbackURL}
			redirect={safeRedirect(redirect)}
			serverError={serverError}
		/>
	);
}
