import { useEffect, useRef, useState } from "react";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "#/shared/components/ui/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/shared/components/ui/select";
import { useFieldContext } from "#/shared/lib/form-contexts";
import { cn } from "#/shared/lib/utils";

type Option = {
	label: string;
	value: string;
	disabled?: boolean;
};

type Props = {
	label: string;
	options: Option[];
	placeholder?: string;
	description?: string;
	disabled?: boolean;
	shakeToken?: number;
};

export const SelectField = ({
	label,
	options,
	placeholder = "Select an option",
	description,
	disabled,
	shakeToken = 0,
}: Props) => {
	const field = useFieldContext<string>();
	const [descriptionShown, setDescriptionShown] = useState(false);
	const [shaking, setShaking] = useState(false);
	const shakenToken = useRef(shakeToken);

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
			<Select
				id={field.name}
				name={field.name}
				items={options}
				value={field.state.value}
				disabled={disabled}
				onValueChange={(value) => field.handleChange(value ?? "")}
				onOpenChange={(open) => {
					if (open) setDescriptionShown(true);
					else field.handleBlur();
				}}
			>
				<SelectTrigger
					aria-invalid={!!error}
					data-valid={valid || undefined}
					onFocus={() => setDescriptionShown(true)}
					onAnimationEnd={() => setShaking(false)}
					className={cn(shaking && "motion-safe:animate-shake")}
				>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{options.map((option) => (
							<SelectItem
								key={option.value}
								value={option.value}
								disabled={option.disabled}
							>
								{option.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
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
