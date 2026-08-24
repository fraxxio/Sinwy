import { createFormHook } from "@tanstack/react-form";
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
