import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import z from "zod";
import { authClient } from "#/modules/auth/lib/auth-client";

const forgotPasswordSchema = z.object({
	email: z.email("Enter a valid email"),
});

// better-auth rate limits /request-password-reset to 3 per 60s
const RESEND_COOLDOWN_SECONDS = 60;

const useForgotPassword = () => {
	const [serverError, setServerError] = useState<string | null>(null);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [cooldown, setCooldown] = useState(0);

	useEffect(() => {
		if (cooldown <= 0) return;
		const id = setTimeout(() => setCooldown((left) => left - 1), 1000);
		return () => clearTimeout(id);
	}, [cooldown]);

	const requestReset = async (email: string) => {
		setServerError(null);
		const { error } = await authClient.requestPasswordReset({
			email,
			redirectTo: "/auth/reset-password",
		});
		if (error) {
			setServerError("Something went wrong. Try again in a moment.");
			return;
		}
		setSentTo(email);
		setCooldown(RESEND_COOLDOWN_SECONDS);
	};

	const form = useForm({
		defaultValues: { email: "" },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: forgotPasswordSchema },
		onSubmit: ({ value }) => requestReset(value.email),
	});

	const resend = () => {
		if (cooldown > 0 || !sentTo) return;
		void requestReset(sentTo);
	};

	return { form, sentTo, serverError, cooldown, resend };
};

export default useForgotPassword;
