import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
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
	const navigate = useNavigate();
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
			const { error } = await authClient.signIn.email(value);
			if (error) {
				setServerError(error.message ?? "Sign in failed");
				return;
			}
			if (callbackURL) await navigate({ href: callbackURL });
			else await navigate({ to: "/auth/postlogin" });
		},
	});

	return { form, serverError, callbackURL };
};

export default useLogin;
