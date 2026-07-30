import { Button } from "#/shared/components/ui/button";
import { useFormContext } from "#/shared/lib/form-contexts";

type Props = {
	label: string;
	pendingLabel: string;
};

export const SubmitButton = ({ label, pendingLabel }: Props) => {
	const form = useFormContext();

	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(isSubmitting) => (
				<Button type="submit" className="w-full" disabled={isSubmitting}>
					{isSubmitting ? pendingLabel : label}
				</Button>
			)}
		</form.Subscribe>
	);
};
