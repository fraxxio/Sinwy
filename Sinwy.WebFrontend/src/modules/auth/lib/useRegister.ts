import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";
import { authClient } from "#/modules/auth/lib/auth-client";

const registerSchema = z.object({
	name: z.string().min(1, "Name is required"),
	email: z.email("Enter a valid email"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

type Props = {
	source?: string | undefined;
};

const useRegister = ({ source }: Props = {}) => {
	const [serverError, setServerError] = useState<string | null>(null);
	const [registerSource] = useState(source);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const callbackURL =
		registerSource === "business" ? "/organizations/new" : "/auth/postlogin";

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		validators: { onSubmit: registerSchema },
		onSubmit: async ({ value }) => {
			setServerError(null);
			const { error } = await authClient.signUp.email({
				...value,
				callbackURL,
			});
			if (error) {
				setServerError(error.message ?? "Sign up failed");
				return;
			}
			setSentTo(value.email);
		},
	});

	return { form, sentTo, serverError, callbackURL };
};

export default useRegister;
