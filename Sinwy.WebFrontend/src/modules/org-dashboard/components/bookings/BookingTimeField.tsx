import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef } from "react";
import type { BookingTimeValue } from "#/modules/org-dashboard/lib/booking-forms";
import { bookingTimesQuery } from "#/modules/org-dashboard/lib/booking-queries";
import { BookableTimesPicker } from "#/shared/components/booking/BookableTimesPicker";
import { FieldError } from "#/shared/components/ui/field";
import { Input } from "#/shared/components/ui/input";
import { Label } from "#/shared/components/ui/label";
import { Switch } from "#/shared/components/ui/switch";
import { formatTimeIn, todayIn } from "#/shared/lib/date";

const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/**
 * A free time from the service's bookable times, or any day and time staff type in.
 * A prefilled start that isn't free switches to a typed time; a picked one that
 * stops being free after a service change is dropped.
 */
export function BookingTimeField({
	organizationId,
	timezone,
	serviceId,
	excludeBookingId,
	value,
	onChange,
	error,
}: {
	organizationId: string;
	timezone: string;
	serviceId: string | null;
	excludeBookingId?: string;
	value: BookingTimeValue;
	onChange: (value: BookingTimeValue) => void;
	error?: string | undefined;
}) {
	const switchId = useId();
	const dateId = useId();
	const timeId = useId();
	const today = todayIn(timezone);
	const prefilled = useRef(value.start || null);
	const times = useQuery({
		...bookingTimesQuery(organizationId, {
			serviceId: serviceId ?? "",
			date: value.date,
			excludeBookingId,
		}),
		enabled: Boolean(serviceId) && !value.custom,
	});

	useEffect(() => {
		if (value.custom || !value.start || !times.data) return;
		const free = times.data.times.find((time) =>
			sameInstant(time, value.start),
		);
		const wasPrefilled = prefilled.current === value.start;
		prefilled.current = null;
		if (free) {
			if (free !== value.start) onChange({ ...value, start: free });
			return;
		}
		onChange(
			wasPrefilled
				? {
						...value,
						custom: true,
						start: "",
						time: formatTimeIn(value.start, timezone),
					}
				: { ...value, start: "" },
		);
	}, [times.data, value, onChange, timezone]);

	const setCustom = (custom: boolean) =>
		onChange({
			...value,
			custom,
			start: "",
			time:
				custom && value.start
					? formatTimeIn(value.start, timezone)
					: value.time,
		});

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<Switch
					id={switchId}
					checked={value.custom}
					onCheckedChange={setCustom}
				/>
				<Label htmlFor={switchId}>Custom time</Label>
			</div>
			{value.custom ? (
				<div className="space-y-2">
					<div className="flex flex-wrap gap-4">
						<div className="space-y-2">
							<Label htmlFor={dateId}>Day</Label>
							<Input
								id={dateId}
								type="date"
								className="w-fit"
								value={value.date}
								onChange={(event) =>
									onChange({ ...value, date: event.target.value })
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={timeId}>Time</Label>
							<Input
								id={timeId}
								type="time"
								className="w-fit"
								value={value.time}
								onChange={(event) =>
									onChange({ ...value, time: event.target.value })
								}
							/>
						</div>
					</div>
					<p className="text-muted-foreground text-xs">
						Any day and minute, past or outside your hours, in {timezone}. It
						still can't overlap another booking.
					</p>
				</div>
			) : serviceId ? (
				<BookableTimesPicker
					timezone={timezone}
					date={value.date}
					minDate={today}
					onDateChange={(date) => onChange({ ...value, date, start: "" })}
					times={times.data?.times ?? []}
					value={value.start || null}
					onChange={(start) => onChange({ ...value, start })}
					loading={times.isPending}
					emptyMessage="No free times on this day. Try another one, or a custom time."
				/>
			) : (
				<p className="text-muted-foreground text-sm">
					Pick a service to see its free times.
				</p>
			)}
			{times.isError && <FieldError>{times.error.message}</FieldError>}
			{error && <FieldError>{error}</FieldError>}
		</div>
	);
}
