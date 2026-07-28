import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";
import { authClient } from "#/modules/auth/lib/auth-client";
import { passwordSchema } from "#/modules/auth/lib/useRegister";

export const resetPasswordSchema = z
	.object({
		password: passwordSchema,
		confirmPassword: z.string(),
	})
	.refine((value) => value.password === value.confirmPassword, {
		path: ["confirmPassword"],
		message: "Passwords do not match",
	});

type Props = {
	token: string;
};

const useResetPassword = ({ token }: Props) => {
	const [serverError, setServerError] = useState<string | null>(null);
	const [tokenRejected, setTokenRejected] = useState(false);
	const navigate = useNavigate();

	const form = useForm({
		defaultValues: { password: "", confirmPassword: "" },
		validationLogic: revalidateLogic({ mode: "change" }),
		validators: { onDynamic: resetPasswordSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error } = await authClient.resetPassword({
				newPassword: value.password,
				token,
			});
			// the token can expire or be spent between opening the page and submitting
			if (error?.code === "INVALID_TOKEN") {
				setTokenRejected(true);
				return;
			}
			if (error) {
				setServerError("Something went wrong. Try again in a moment.");
				return;
			}
			await navigate({ to: "/auth/login" });
		},
	});

	return { form, serverError, tokenRejected };
};

export default useResetPassword;
