import type { AvailabilityDto, BookingDto, ServiceDto } from "@sinwy/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { ServiceFilter } from "#/modules/org-dashboard/components/bookings/BookingFilters";
import { MonthView } from "#/modules/org-dashboard/components/bookings/MonthView";
import { TimeGridView } from "#/modules/org-dashboard/components/bookings/TimeGridView";
import type { BookingsSearch } from "#/modules/org-dashboard/lib/booking-search";
import {
	CALENDAR_VIEWS,
	type CalendarView,
	rangeTitle,
	shiftDate,
} from "#/modules/org-dashboard/lib/calendar";
import { Button } from "#/shared/components/ui/button";
import { Label } from "#/shared/components/ui/label";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { Switch } from "#/shared/components/ui/switch";
import { cn } from "#/shared/lib/utils";

const VIEW_LABELS: Record<CalendarView, string> = {
	month: "Month",
	week: "Week",
	day: "Day",
};

export type CalendarChange = Partial<
	Pick<BookingsSearch, "calendarView" | "date" | "showCancelled" | "serviceId">
>;

export function BookingsCalendar({
	search,
	date,
	dates,
	today,
	bookings,
	loading,
	availability,
	services,
	organizationSlug,
	onChange,
	onPickStart,
}: {
	search: BookingsSearch;
	date: string;
	dates: string[];
	today: string;
	bookings: BookingDto[] | undefined;
	loading: boolean;
	availability: AvailabilityDto;
	services: Pick<ServiceDto, "id" | "name">[];
	organizationSlug: string;
	onChange: (change: CalendarChange) => void;
	onPickStart?: ((start: Date) => void) | undefined;
}) {
	const view = search.calendarView;
	const showDay = (day: string) => onChange({ calendarView: "day", date: day });

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<div className="flex items-center gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Previous"
						onClick={() => onChange({ date: shiftDate(view, date, -1) })}
					>
						<ChevronLeftIcon />
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => onChange({ date: undefined })}
					>
						Today
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Next"
						onClick={() => onChange({ date: shiftDate(view, date, 1) })}
					>
						<ChevronRightIcon />
					</Button>
				</div>
				<h2 className="font-medium text-lg">{rangeTitle(view, date)}</h2>
				<div className="ml-auto flex flex-wrap items-center gap-3">
					<ServiceFilter
						services={services}
						value={search.serviceId}
						onChange={(serviceId) => onChange({ serviceId })}
					/>
					<Label className="gap-2 text-sm">
						<Switch
							checked={search.showCancelled}
							onCheckedChange={(showCancelled) => onChange({ showCancelled })}
						/>
						Show cancelled
					</Label>
					<div className="flex rounded-lg border p-0.5">
						{CALENDAR_VIEWS.map((option) => (
							<Button
								key={option}
								size="sm"
								variant="ghost"
								aria-pressed={option === view}
								className={cn(option === view && "bg-muted")}
								onClick={() => onChange({ calendarView: option })}
							>
								{VIEW_LABELS[option]}
							</Button>
						))}
					</div>
				</div>
			</div>
			{loading && !bookings ? (
				<Skeleton className="h-[60vh] rounded-lg" />
			) : view === "month" ? (
				<MonthView
					dates={dates}
					month={date.slice(0, 7)}
					today={today}
					bookings={bookings ?? []}
					timezone={availability.timezone}
					organizationSlug={organizationSlug}
					onShowDay={showDay}
				/>
			) : (
				<TimeGridView
					dates={dates}
					today={today}
					bookings={bookings ?? []}
					availability={availability}
					organizationSlug={organizationSlug}
					onShowDay={view === "week" ? showDay : undefined}
					onPickStart={onPickStart}
				/>
			)}
		</div>
	);
}
