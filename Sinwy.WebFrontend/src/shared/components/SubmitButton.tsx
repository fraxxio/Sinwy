import { Button } from "#/shared/components/ui/button";
import { useFormContext } from "#/shared/lib/form-contexts";
import { cn } from "#/shared/lib/utils";

type Props = {
	label: string;
	pendingLabel: string;
	className?: string;
};

export const SubmitButton = ({ label, pendingLabel, className }: Props) => {
	const form = useFormContext();

	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(isSubmitting) => (
				<Button
					type="submit"
					className={cn("w-full", className)}
					disabled={isSubmitting}
				>
					{isSubmitting ? pendingLabel : label}
				</Button>
			)}
		</form.Subscribe>
	);
};
