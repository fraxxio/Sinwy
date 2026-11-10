import {
	AUTH_ERROR_CODES,
	passwordSchema,
	RESEND_COOLDOWN_SECONDS,
	userNameSchema,
} from "@sinwy/shared";
import { formOptions, revalidateLogic } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import z from "zod";
import { safeRedirect } from "#/modules/auth/lib/safe-redirect";
import { authClient } from "#/shared/lib/auth/auth-client";
import { authErrorMessage } from "#/shared/lib/auth/auth-error";
import { showFieldError, useAppForm } from "#/shared/lib/form";

export const registerSchema = z
	.object({
		name: userNameSchema,
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
	redirect?: string | undefined;
};

/** Where the verification link (and Google sign-up) lands: a safe `redirect` wins over the business funnel. */
export const registerCallbackURL = ({ source, redirect }: Props) =>
	safeRedirect(redirect) ??
	(source === "business" ? "/organizations/new" : "/auth/postlogin");

const useRegister = (props: Props = {}) => {
	const [serverError, setServerError] = useState<string | null>(null);
	const [callbackURL] = useState(() => registerCallbackURL(props));
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [resendDooldown, setResendCooldown] = useState(0);
	const [shakeToken, setShakeToken] = useState(0);
	const lastShakeAt = useRef(0);

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
			if (error?.code === AUTH_ERROR_CODES.EMAIL_DOMAIN_INVALID) {
				showFieldError(form, "email", authErrorMessage(error));
				return;
			}
			if (error) {
				setServerError(authErrorMessage(error));
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
