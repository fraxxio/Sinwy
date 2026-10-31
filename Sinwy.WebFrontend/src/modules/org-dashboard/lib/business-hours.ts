import {
	type AvailabilityDto,
	type AvailabilityInput,
	availabilitySchema,
	closureSchema,
	weeklyRangeSchema,
} from "@sinwy/shared";
import { z } from "zod";

export const WEEKDAYS = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
] as const;

export type DayValues = {
	/** ISO weekday: 1 = Monday … 7 = Sunday */
	weekday: number;
	open: boolean;
	start: string;
	end: string;
};

export type BusinessHoursFormValues = {
	timezone: string;
	days: DayValues[];
};

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

const daySchema = z
	.object({
		weekday: z.number(),
		open: z.boolean(),
		start: z.string(),
		end: z.string(),
	})
	.superRefine((day, ctx) => {
		if (!day.open) return;
		const range = weeklyRangeSchema.safeParse(day);
		for (const issue of range.success ? [] : range.error.issues)
			ctx.addIssue({
				code: "custom",
				message: issue.message,
				path: issue.path,
			});
	});

export const businessHoursFormSchema = z.object({
	timezone: availabilitySchema.shape.timezone,
	days: z.array(daySchema),
});

export const toBusinessHoursFormValues = (
	availability: Pick<AvailabilityDto, "timezone" | "weekly">,
): BusinessHoursFormValues => ({
	timezone: availability.timezone,
	days: WEEKDAYS.map((_, i) => {
		const weekday = i + 1;
		const range = availability.weekly.find((r) => r.weekday === weekday);
		return range
			? { weekday, open: true, start: range.start, end: range.end }
			: { weekday, open: false, start: DEFAULT_START, end: DEFAULT_END };
	}),
});

export const toAvailabilityInput = (
	values: BusinessHoursFormValues,
): AvailabilityInput =>
	availabilitySchema.parse({
		timezone: values.timezone,
		weekly: values.days
			.filter((day) => day.open)
			.map(({ weekday, start, end }) => ({ weekday, start, end })),
	});

/** Monday's hours on Tuesday to Friday; the weekend stays as it is. */
export const copyMondayToWeekdays = (days: DayValues[]): DayValues[] => {
	const monday = days.find((day) => day.weekday === 1);
	if (!monday) return days;
	return days.map((day) =>
		day.weekday >= 2 && day.weekday <= 5
			? { ...monday, weekday: day.weekday }
			: day,
	);
};

/** Every zone this browser knows, plus the stored one when the list lacks it. */
export const timeZoneOptions = (stored: string) =>
	[...new Set([...Intl.supportedValuesOf("timeZone"), "UTC", stored])]
		.sort()
		.map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }));

/** Today's date ("YYYY-MM-DD") on the organization's wall clock. */
export const todayIn = (timezone: string, now = new Date()) =>
	new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);

export type ClosureFormValues = { date: string; note: string };

export const closureFormSchema = (today: string) =>
	z.object({
		date: closureSchema.shape.date.refine(
			(date) => date >= today,
			"Pick today or a later date",
		),
		note: z.string(),
	});

/** "Fri, Nov 6, 2026" for a "YYYY-MM-DD" date, whatever the viewer's own zone. */
export const formatLocalDate = (date: string, locale?: string) =>
	new Intl.DateTimeFormat(locale, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${date}T00:00:00Z`));
