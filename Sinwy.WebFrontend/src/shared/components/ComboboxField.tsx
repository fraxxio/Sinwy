import { useEffect, useRef, useState } from "react";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "#/shared/components/ui/combobox";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "#/shared/components/ui/field";
import { fieldErrorState } from "#/shared/lib/field-error";
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
	emptyMessage?: string;
	description?: string;
	disabled?: boolean;
	clearable?: boolean;
	shakeToken?: number;
};

export const ComboboxField = ({
	label,
	options,
	placeholder = "Search options",
	emptyMessage = "No matches",
	description,
	disabled,
	clearable = false,
	shakeToken = 0,
}: Props) => {
	const field = useFieldContext<string>();
	const [descriptionShown, setDescriptionShown] = useState(false);
	const [shaking, setShaking] = useState(false);
	const [open, setOpen] = useState(false);
	const shakenToken = useRef(shakeToken);

	const { error, valid } = fieldErrorState({
		isBlurred: field.state.meta.isBlurred,
		submissionAttempts: field.form.state.submissionAttempts,
		errors: field.state.meta.errors,
		value: field.state.value,
	});

	const selected = options.find(({ value }) => value === field.state.value);

	useEffect(() => {
		if (shakeToken === shakenToken.current) return;
		shakenToken.current = shakeToken;
		if (!field.state.meta.isValid) setShaking(true);
	}, [shakeToken, field.state.meta.isValid]);

	return (
		<Field className="gap-2" data-invalid={!!error || undefined}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			{/* animationend bubbles up from the input shell, which is what shakes */}
			<div onAnimationEnd={() => setShaking(false)}>
				<Combobox
					name={field.name}
					items={options}
					value={selected ?? null}
					disabled={disabled}
					onValueChange={(option: Option | null) =>
						field.handleChange(option?.value ?? "")
					}
					onOpenChange={(next) => {
						setOpen(next);
						if (next) setDescriptionShown(true);
						else field.handleBlur();
					}}
				>
					<ComboboxInput
						id={field.name}
						placeholder={placeholder}
						disabled={disabled}
						showClear={clearable}
						aria-invalid={!!error}
						data-valid={valid || undefined}
						onFocus={() => setDescriptionShown(true)}
						onBlur={() => {
							if (!open) field.handleBlur();
						}}
						className={cn("w-full", shaking && "motion-safe:animate-shake")}
					/>
					<ComboboxContent>
						<ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
						<ComboboxList>
							{(option: Option) => (
								<ComboboxItem
									key={option.value}
									value={option}
									disabled={option.disabled}
								>
									{option.label}
								</ComboboxItem>
							)}
						</ComboboxList>
					</ComboboxContent>
				</Combobox>
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
