import { Input } from "#/shared/components/ui/input";
import { Label } from "#/shared/components/ui/label";

/** The org-local inclusive range on the payment's creation date. */
export function PaymentFilters({
	from,
	to,
	onChange,
}: {
	from: string;
	to: string;
	onChange: (change: { from?: string; to?: string }) => void;
}) {
	return (
		<div className="flex flex-wrap items-end gap-2">
			<div className="grid gap-1">
				<Label htmlFor="payments-from" className="text-xs">
					From
				</Label>
				<Input
					id="payments-from"
					type="date"
					className="w-40"
					value={from}
					max={to}
					onChange={(event) =>
						event.target.value && onChange({ from: event.target.value })
					}
				/>
			</div>
			<div className="grid gap-1">
				<Label htmlFor="payments-to" className="text-xs">
					To
				</Label>
				<Input
					id="payments-to"
					type="date"
					className="w-40"
					value={to}
					min={from}
					onChange={(event) =>
						event.target.value && onChange({ to: event.target.value })
					}
				/>
			</div>
		</div>
	);
}
