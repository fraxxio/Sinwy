import type {
	AnyFieldApi,
	DeepKeys,
	ReactFormExtendedApi,
} from "@tanstack/react-form";
import type * as React from "react";
import { Field, FieldError, FieldLabel } from "#/shared/components/ui/field";
import { Input } from "#/shared/components/ui/input";

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
} & Omit<React.ComponentProps<typeof Input>, "name" | "form">;

export const FormInput = <TFormData,>({
	form,
	name,
	label,
	...inputProps
}: FormInputProps<TFormData>) => (
	<form.Field name={name}>
		{(field: AnyFieldApi) => {
			const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
			return (
				<Field data-invalid={invalid || undefined}>
					<FieldLabel htmlFor={field.name}>{label}</FieldLabel>
					<Input
						id={field.name}
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						aria-invalid={invalid}
						{...inputProps}
					/>
					{invalid && <FieldError errors={field.state.meta.errors} />}
				</Field>
			);
		}}
	</form.Field>
);
