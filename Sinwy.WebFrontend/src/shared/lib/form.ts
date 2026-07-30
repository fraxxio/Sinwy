import { createFormHook } from "@tanstack/react-form";
import { SubmitButton } from "#/shared/components/SubmitButton";
import { TextField } from "#/shared/components/TextField";
import { fieldContext, formContext } from "#/shared/lib/form-contexts";

export const { useAppForm, withForm } = createFormHook({
	fieldComponents: { TextField },
	formComponents: { SubmitButton },
	fieldContext,
	formContext,
});
