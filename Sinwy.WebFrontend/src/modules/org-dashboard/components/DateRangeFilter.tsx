import { useId } from "react";
import {
	type DateRange,
	type DateRangePreset,
	sameRange,
} from "#/modules/org-dashboard/lib/date-range";
import { Button } from "#/shared/components/ui/button";
import { Input } from "#/shared/components/ui/input";
import { Label } from "#/shared/components/ui/label";

/** An org-local inclusive date range, with optional one-click presets. */
export function DateRangeFilter({
	from,
	to,
	min,
	max,
	presets = [],
	onChange,
}: DateRange & {
	min?: string;
	max?: string;
	presets?: DateRangePreset[];
	onChange: (change: Partial<DateRange>) => void;
}) {
	const id = useId();

	return (
		<div className="flex flex-wrap items-end gap-2">
			{presets.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{presets.map((preset) => (
						<Button
							key={preset.label}
							type="button"
							size="sm"
							variant={sameRange(preset, { from, to }) ? "secondary" : "ghost"}
							aria-pressed={sameRange(preset, { from, to })}
							onClick={() => onChange({ from: preset.from, to: preset.to })}
						>
							{preset.label}
						</Button>
					))}
				</div>
			)}
			<div className="grid gap-1">
				<Label htmlFor={`${id}-from`} className="text-xs">
					From
				</Label>
				<Input
					id={`${id}-from`}
					type="date"
					className="w-40"
					value={from}
					min={min}
					max={to || max}
					onChange={(event) =>
						event.target.value && onChange({ from: event.target.value })
					}
				/>
			</div>
			<div className="grid gap-1">
				<Label htmlFor={`${id}-to`} className="text-xs">
					To
				</Label>
				<Input
					id={`${id}-to`}
					type="date"
					className="w-40"
					value={to}
					min={from || min}
					max={max}
					onChange={(event) =>
						event.target.value && onChange({ to: event.target.value })
					}
				/>
			</div>
		</div>
	);
}
