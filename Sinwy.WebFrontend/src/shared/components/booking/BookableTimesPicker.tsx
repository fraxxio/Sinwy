import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "#/shared/components/ui/button";
import { Input } from "#/shared/components/ui/input";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { addDaysToDate, formatTimeIn } from "#/shared/lib/date";

type Props = {
	/** The zone the times are shown in, the organization's. */
	timezone: string;
	/** "YYYY-MM-DD" in `timezone`. */
	date: string;
	onDateChange: (date: string) => void;
	minDate?: string;
	maxDate?: string;
	/** ISO instants. */
	times: string[];
	value: string | null;
	onChange: (time: string) => void;
	loading?: boolean;
	emptyMessage?: string;
};

const PLACEHOLDERS = ["a", "b", "c", "d", "e", "f", "g", "h"];

/** A day, then its free start times as buttons; the caller fetches the times. */
export function BookableTimesPicker({
	timezone,
	date,
	onDateChange,
	minDate,
	maxDate,
	times,
	value,
	onChange,
	loading = false,
	emptyMessage = "No free times on this day. Try another one.",
}: Props) {
	const dateId = useId();
	const previous = addDaysToDate(date, -1);
	const next = addDaysToDate(date, 1);

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<label htmlFor={dateId} className="font-medium text-sm">
					Day
				</label>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label="Previous day"
						disabled={minDate !== undefined && previous < minDate}
						onClick={() => onDateChange(previous)}
					>
						<ChevronLeftIcon />
					</Button>
					<Input
						id={dateId}
						type="date"
						className="w-fit"
						value={date}
						min={minDate}
						max={maxDate}
						required
						onChange={(event) => {
							if (event.target.value) onDateChange(event.target.value);
						}}
					/>
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label="Next day"
						disabled={maxDate !== undefined && next > maxDate}
						onClick={() => onDateChange(next)}
					>
						<ChevronRightIcon />
					</Button>
				</div>
			</div>
			<div className="space-y-2">
				<p className="text-muted-foreground text-xs">Times in {timezone}</p>
				{loading ? (
					<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
						{PLACEHOLDERS.map((key) => (
							<Skeleton key={key} className="h-9 rounded-md" />
						))}
					</div>
				) : times.length === 0 ? (
					<p className="text-muted-foreground text-sm">{emptyMessage}</p>
				) : (
					<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
						{times.map((time) => (
							<Button
								key={time}
								type="button"
								variant={time === value ? "default" : "outline"}
								aria-pressed={time === value}
								onClick={() => onChange(time)}
							>
								{formatTimeIn(time, timezone)}
							</Button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
