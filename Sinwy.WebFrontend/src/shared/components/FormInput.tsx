import type {
	AnyFieldApi,
	DeepKeys,
	ReactFormExtendedApi,
} from "@tanstack/react-form";
import { Eye, EyeOff } from "lucide-react";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "#/shared/components/ui/field";
import { Input } from "#/shared/components/ui/input";
import { cn } from "#/shared/lib/utils";

// biome-ignore lint/suspicious/noExplicitAny: only TFormData matters for rendering a field; the validator generics vary per form
type Any = any;

type FormInputProps<TFormData> = {
	form: ReactFormExtendedApi<
		TFormData,
		Any,
		Any,
		Any,
		Any,
		Any,
		Any,
		Any,
		Any,
		Any,
		Any,
		Any
	>;
	name: DeepKeys<TFormData>;
	label: string;
	description?: string;
	shakeToken?: number;
} & Omit<ComponentProps<typeof Input>, "name" | "form">;

export const FormInput = <TFormData,>({
	form,
	name,
	...rest
}: FormInputProps<TFormData>) => (
	<form.Field name={name}>
		{(field: AnyFieldApi) => <FieldRow field={field} {...rest} />}
	</form.Field>
);

type FieldRowProps = {
	field: AnyFieldApi;
	label: string;
	description?: string;
	shakeToken?: number;
} & Omit<ComponentProps<typeof Input>, "name" | "form">;

const FieldRow = ({
	field,
	label,
	description,
	shakeToken = 0,
	type,
	...inputProps
}: FieldRowProps) => {
	const [descriptionShown, setDescriptionShown] = useState(false);
	const [shaking, setShaking] = useState(false);
	const [passwordShown, setPasswordShown] = useState(false);
	const shakenToken = useRef(shakeToken);

	const isPassword = type === "password";

	const revealed =
		field.state.meta.isBlurred || field.form.state.submissionAttempts > 0;
	const error = revealed ? field.state.meta.errors[0]?.message : undefined;
	const valid = revealed && !error && !!field.state.value;

	useEffect(() => {
		if (shakeToken === shakenToken.current) return;
		shakenToken.current = shakeToken;
		if (!field.state.meta.isValid) setShaking(true);
	}, [shakeToken, field.state.meta.isValid]);

	return (
		<Field className="gap-2" data-invalid={!!error || undefined}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			<div className="relative">
				<Input
					id={field.name}
					name={field.name}
					type={isPassword && passwordShown ? "text" : type}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
					onFocus={() => setDescriptionShown(true)}
					onAnimationEnd={() => setShaking(false)}
					aria-invalid={!!error}
					data-valid={valid || undefined}
					className={cn(
						shaking && "motion-safe:animate-shake",
						isPassword && "pr-10",
					)}
					{...inputProps}
				/>
				{isPassword && (
					<button
						type="button"
						onClick={() => setPasswordShown((shown) => !shown)}
						aria-label={passwordShown ? "Hide password" : "Show password"}
						aria-controls={field.name}
						className="absolute inset-y-0 right-0 flex items-center rounded-md px-3 text-muted-foreground transition-colors duration-150 ease-glide hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						{passwordShown ? (
							<EyeOff className="size-4" aria-hidden="true" />
						) : (
							<Eye className="size-4" aria-hidden="true" />
						)}
					</button>
				)}
			</div>
			<div className="min-h-5 text-xs">
				{error ? (
					<FieldError className="text-xs">{error}</FieldError>
				) : (
					descriptionShown &&
					description && (
						<FieldDescription className="text-xs">
							{description}
						</FieldDescription>
					)
				)}
			</div>
		</Field>
	);
};
