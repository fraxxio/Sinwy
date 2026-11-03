import type { AvailabilityDto, BookingDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
	bookingSpan,
	closedSpans,
	dayColumn,
	firstOpeningPosition,
	gridRows,
	instantAt,
} from "#/modules/org-dashboard/lib/calendar";
import { BOOKING_STATUS_STYLES } from "#/shared/components/booking/BookingStatusBadge";
import { formatTimeIn } from "#/shared/lib/date";
import { cn } from "#/shared/lib/utils";

/** Pixels per minute: an hour is 48px. */
const SCALE = 0.8;
const px = (minutes: number) => `${minutes * SCALE}px`;

export function TimeGridView({
	dates,
	today,
	bookings,
	availability,
	organizationSlug,
	onShowDay,
	onPickStart,
}: {
	dates: string[];
	today: string;
	bookings: BookingDto[];
	availability: Pick<AvailabilityDto, "timezone" | "weekly" | "closures">;
	organizationSlug: string;
	onShowDay?: ((date: string) => void) | undefined;
	/** Clicking an empty spot; absent for users who can't add bookings. */
	onPickStart?: ((start: Date) => void) | undefined;
}) {
	const { timezone, weekly, closures } = availability;
	const columns = useMemo(
		() => dates.map((date) => dayColumn(date, timezone)),
		[dates, timezone],
	);
	const rows = useMemo(() => gridRows(columns), [columns]);
	const total = rows.length * 60;

	const scroller = useRef<HTMLDivElement>(null);
	const opening = firstOpeningPosition(weekly, rows);
	useLayoutEffect(() => {
		if (scroller.current)
			scroller.current.scrollTop = Math.max(0, opening - 30) * SCALE;
	}, [opening]);

	const template = {
		gridTemplateColumns: `3.5rem repeat(${dates.length}, 1fr)`,
	};

	return (
		<div className="overflow-hidden rounded-lg border">
			<div className="grid border-b bg-muted/40 text-xs" style={template}>
				<div />
				{dates.map((date) => {
					const label = format(parseISO(date), "EEE d");
					return (
						<div key={date} className="border-l px-2 py-1.5">
							{onShowDay ? (
								<button
									type="button"
									onClick={() => onShowDay(date)}
									className={cn(
										"rounded px-1 font-medium hover:bg-muted",
										date === today && "text-primary",
									)}
								>
									{label}
								</button>
							) : (
								<span
									className={cn(
										"font-medium",
										date === today && "text-primary",
									)}
								>
									{label}
								</span>
							)}
						</div>
					);
				})}
			</div>
			<div ref={scroller} className="max-h-[70vh] overflow-y-auto">
				<div className="grid" style={{ ...template, height: px(total) }}>
					<div className="relative">
						{rows.map((row, index) => (
							<span
								key={row.key}
								className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums first:hidden"
								style={{ top: px(index * 60) }}
							>
								{row.label}
							</span>
						))}
					</div>
					{columns.map((column) => (
						<div
							key={column.date}
							data-date={column.date}
							className="relative border-l"
							style={{
								backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${px(60)})`,
							}}
						>
							{onPickStart && (
								<button
									type="button"
									tabIndex={-1}
									aria-label={`Add a booking on ${column.date}`}
									className="absolute inset-0 cursor-pointer"
									onClick={(event) => {
										const top = event.currentTarget.getBoundingClientRect().top;
										const start = instantAt(
											(event.clientY - top) / SCALE,
											column,
											rows,
										);
										if (start) onPickStart(start);
									}}
								/>
							)}
							{closedSpans(column, rows, weekly, closures).map((span) => (
								<div
									key={`${span.top}-${span.height}`}
									aria-hidden
									className="pointer-events-none absolute inset-x-0 bg-muted/60"
									style={{ top: px(span.top), height: px(span.height) }}
								/>
							))}
							{bookings.map((booking) => {
								const span = bookingSpan(booking, column, rows);
								if (!span) return null;
								return (
									<Link
										key={booking.id}
										to="/dashboard/$organizationSlug/bookings/$id"
										params={{ organizationSlug, id: booking.id }}
										data-booking-id={booking.id}
										className={cn(
											"absolute inset-x-1 overflow-hidden rounded border px-1.5 py-0.5 text-xs leading-tight",
											BOOKING_STATUS_STYLES[booking.status],
										)}
										style={{
											top: px(span.top),
											height: px(Math.max(span.height, 15)),
										}}
									>
										<span className="block truncate">
											<span className="font-medium tabular-nums">
												{formatTimeIn(booking.startsAt, timezone)}
											</span>{" "}
											{booking.customerName}
										</span>
										{span.height >= 45 && (
											<span className="block truncate opacity-80">
												{booking.serviceName}
											</span>
										)}
									</Link>
								);
							})}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
