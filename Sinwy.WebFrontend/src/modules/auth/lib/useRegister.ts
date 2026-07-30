import { RESEND_COOLDOWN_SECONDS } from "@sinwy/shared";
import { formOptions, revalidateLogic } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import z from "zod";
import { authClient } from "#/modules/auth/lib/auth-client";
import { useAppForm } from "#/shared/lib/form";

export const PASSWORD_RULES =
	"At least 10 characters, including one number and one symbol.";

// 128 mirrors better-auth's maxPasswordLength, which rejects server-side otherwise
export const passwordSchema = z
	.string()
	.regex(/^(?=.*\d)(?=.*[^\p{L}\d])[^\s]{10,}$/u, PASSWORD_RULES)
	.max(128, "Password must be at most 128 characters");

export const registerSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(3, "Name must be at least 3 characters")
			.regex(
				/^\p{L}+(?:[ -]\p{L}+)*$/u,
				"Use letters, spaces and hyphens only",
			),
		email: z.email("Enter a valid email"),
		password: passwordSchema,
		confirmPassword: z.string(),
	})
	.refine((value) => value.password === value.confirmPassword, {
		path: ["confirmPassword"],
		message: "Passwords do not match",
	});

export const registerFormOpts = formOptions({
	defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
	validationLogic: revalidateLogic({ mode: "change" }),
	validators: { onDynamic: registerSchema },
});

const SHAKE_DEBOUNCE_MS = 600;

type Props = {
	source?: string | undefined;
};

const useRegister = ({ source }: Props = {}) => {
	const [serverError, setServerError] = useState<string | null>(null);
	const [registerSource] = useState(source);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [resendDooldown, setResendCooldown] = useState(0);
	const [shakeToken, setShakeToken] = useState(0);
	const lastShakeAt = useRef(0);
	const callbackURL =
		registerSource === "business" ? "/organizations/new" : "/auth/postlogin";

	useEffect(() => {
		if (resendDooldown <= 0) return;
		const id = setTimeout(() => setResendCooldown((left) => left - 1), 1000);
		return () => clearTimeout(id);
	}, [resendDooldown]);

	const form = useAppForm({
		...registerFormOpts,
		onSubmitInvalid: () => {
			const now = Date.now();
			if (now - lastShakeAt.current < SHAKE_DEBOUNCE_MS) return;
			lastShakeAt.current = now;
			setShakeToken((token) => token + 1);
		},
		onSubmit: async ({ value: { confirmPassword: _, ...value } }) => {
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
			setResendCooldown(RESEND_COOLDOWN_SECONDS);
		},
	});

	const resend = async () => {
		if (resendDooldown > 0 || !sentTo) return;
		setServerError(null);
		const { error } = await authClient.sendVerificationEmail({
			email: sentTo,
			callbackURL,
		});
		if (error) {
			setServerError("Something went wrong. Try again in a moment.");
			return;
		}
		setResendCooldown(RESEND_COOLDOWN_SECONDS);
	};

	const reset = () => {
		setSentTo(null);
		setServerError(null);
	};

	return {
		form,
		sentTo,
		serverError,
		callbackURL,
		shakeToken,
		resendDooldown,
		resend,
		reset,
	};
};

export default useRegister;
