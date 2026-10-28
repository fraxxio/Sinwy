import { type AnyFormApi, createFormHook } from "@tanstack/react-form";
import { ComboboxField } from "#/shared/components/ComboboxField";
import { SelectField } from "#/shared/components/SelectField";
import { SubmitButton } from "#/shared/components/SubmitButton";
import { TextareaField } from "#/shared/components/TextareaField";
import { TextField } from "#/shared/components/TextField";
import { fieldContext, formContext } from "#/shared/lib/form-contexts";

export const { useAppForm, withForm } = createFormHook({
	fieldComponents: { TextField, TextareaField, SelectField, ComboboxField },
	formComponents: { SubmitButton },
	fieldContext,
	formContext,
});

// a server refusal for one field, cleared by the next validation like a schema error
export const showFieldError = (
	form: AnyFormApi,
	name: string,
	message: string,
) =>
	form.setFieldMeta(name, (meta) => ({
		...meta,
		errorMap: { ...meta.errorMap, onDynamic: { message } },
		errorSourceMap: { ...meta.errorSourceMap, onDynamic: "form" },
	}));
