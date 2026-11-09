import { csvOf, majorUnits } from "@backend/lib/csv";
import type {
	AnalyticsFunnelStep,
	BookingsDto,
	FunnelDto,
	TrafficDto,
} from "@sinwy/shared";

export const trafficCsv = ({ series }: TrafficDto) =>
	csvOf([
		["Date", "Views", "Visitors"],
		...series.map((day) => [day.date, day.views, day.visitors]),
	]);

export const bookingsCsv = ({ range, series }: BookingsDto) =>
	csvOf([
		["Date", "Bookings made", "Booked value", "Currency"],
		...series.map((day) => [
			day.date,
			day.bookings,
			majorUnits(day.bookedMinor, range.currency),
			range.currency,
		]),
	]);

const STEP_LABELS: Record<AnalyticsFunnelStep, string> = {
	viewed: "Viewed",
	started: "Started booking",
	booked: "Booked",
};

const percentOf = (part: number, whole: number | undefined) =>
	whole ? `${((part / whole) * 100).toFixed(1)}%` : "";

export const funnelCsv = ({ steps }: FunnelDto) =>
	csvOf([
		["Step", "Count", "Of previous step"],
		...steps.map(({ step, count }, index) => [
			STEP_LABELS[step],
			count,
			percentOf(count, steps[index - 1]?.count),
		]),
	]);
