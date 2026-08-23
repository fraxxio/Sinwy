import type { ComponentProps } from "react";
import { useState } from "react";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "#/shared/components/ui/field";
import { Textarea } from "#/shared/components/ui/textarea";
import { fieldErrorState } from "#/shared/lib/field-error";
import { useFieldContext } from "#/shared/lib/form-contexts";

type Props = {
	label: string;
	description?: string;
} & Omit<ComponentProps<typeof Textarea>, "name" | "form">;

export const TextareaField = ({
	label,
	description,
	...textareaProps
}: Props) => {
	const field = useFieldContext<string>();
	const [descriptionShown, setDescriptionShown] = useState(false);

	const { error, valid } = fieldErrorState({
		isBlurred: field.state.meta.isBlurred,
		submissionAttempts: field.form.state.submissionAttempts,
		errors: field.state.meta.errors,
		value: field.state.value,
	});
	const { maxLength } = textareaProps;

	return (
		<Field className="gap-2" data-invalid={!!error || undefined}>
			<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
			<Textarea
				id={field.name}
				name={field.name}
				value={field.state.value}
				onBlur={field.handleBlur}
				onChange={(e) => field.handleChange(e.target.value)}
				onFocus={() => setDescriptionShown(true)}
				aria-invalid={!!error}
				data-valid={valid || undefined}
				{...textareaProps}
			/>
			<div className="flex min-h-5 items-start justify-between gap-3 text-xs">
				{error ? (
					<FieldError className="text-xs">{error}</FieldError>
				) : (
					<FieldDescription className="text-xs">
						{descriptionShown && description}
					</FieldDescription>
				)}
				{maxLength && descriptionShown && (
					<span className="shrink-0 tabular-nums text-muted-foreground">
						{field.state.value.length}/{maxLength}
					</span>
				)}
			</div>
		</Field>
	);
};
