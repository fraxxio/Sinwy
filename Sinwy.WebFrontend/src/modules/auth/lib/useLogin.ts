import { revalidateLogic, useForm } from "@tanstack/react-form";
import { BASE_ERROR_CODES } from "better-auth";
import { useState } from "react";
import z from "zod";
import { authClient } from "#/modules/auth/lib/auth-client";

const loginSchema = z.object({
	email: z.email("Enter a valid email"),
	password: z.string().min(1, "Password is required"),
});

type Props = {
	redirectFrom: string | undefined;
};

const useLogin = ({ redirectFrom }: Props) => {
	const [serverError, setServerError] = useState<string | null>(null);
	const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
	const callbackURL =
		redirectFrom?.startsWith("/") && !redirectFrom.startsWith("//")
			? redirectFrom
			: undefined;

	const form = useForm({
		defaultValues: { email: "", password: "" },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: loginSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			// callbackURL rides into the verification link (sendOnSignIn) and,
			// on success, the client redirects there itself
			const { error } = await authClient.signIn.email({
				...value,
				callbackURL: callbackURL ?? "/auth/postlogin",
			});
			if (!error) return;
			if (error.code === BASE_ERROR_CODES.EMAIL_NOT_VERIFIED.code)
				setUnverifiedEmail(value.email);
			else setServerError(error.message ?? "Sign in failed");
		},
	});

	return {
		form,
		serverError,
		callbackURL,
		unverifiedEmail,
		clearUnverified: () => setUnverifiedEmail(null),
	};
};

export default useLogin;
