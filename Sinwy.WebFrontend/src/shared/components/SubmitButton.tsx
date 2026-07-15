import type { ReactFormExtendedApi } from "@tanstack/react-form";
import { Button } from "#/shared/components/ui/button";

// biome-ignore lint/suspicious/noExplicitAny: the submit state doesn't depend on the form's data shape; the generics vary per form
type Any = any;

type SubmitButtonProps = {
	form: ReactFormExtendedApi<
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
		Any,
		Any
	>;
	label: string;
	pendingLabel: string;
};

export const SubmitButton = ({
	form,
	label,
	pendingLabel,
}: SubmitButtonProps) => (
	<form.Subscribe>
		{(state) => (
			<Button type="submit" className="w-full" disabled={state.isSubmitting}>
				{state.isSubmitting ? pendingLabel : label}
			</Button>
		)}
	</form.Subscribe>
);
