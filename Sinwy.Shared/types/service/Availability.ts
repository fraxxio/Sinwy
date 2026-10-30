import { z } from "zod";
import { isTimeZone } from "../organization/TimeZone";

/** "closed" shuts a date; "open" adds hours to it. The MVP writes only whole-day closures. */
export const AVAILABILITY_EXCEPTION_KINDS = ["closed", "open"] as const;
export type AvailabilityExceptionKind =
	(typeof AVAILABILITY_EXCEPTION_KINDS)[number];

export const AVAILABILITY_LIMITS = {
	stepMinutes: 15,
	closureNote: 200,
} as const;

/** Wall-clock times are "HH:MM" and dates "YYYY-MM-DD", read in the organization's timezone. */
export type WeeklyRangeDto = {
	/** ISO weekday: 1 = Monday … 7 = Sunday */
	weekday: number;
	start: string;
	end: string;
};

export type ClosureDto = {
	id: string;
	date: string;
	note: string | null;
};

export type AvailabilityDto = {
	timezone: string;
	weekly: WeeklyRangeDto[];
	closures: ClosureDto[];
};

const quarterHour = z
	.string()
	.regex(
		/^([01]\d|2[0-3]):(00|15|30|45)$/,
		`Use a time on a ${AVAILABILITY_LIMITS.stepMinutes}-minute step, like 09:15`,
	);

export const weeklyRangeSchema = z
	.object({
		weekday: z
			.number()
			.int()
			.min(1, "Invalid weekday")
			.max(7, "Invalid weekday"),
		start: quarterHour,
		end: quarterHour,
	})
	.refine((range) => range.end > range.start, {
		message: "End must be after start",
		path: ["end"],
	});

export const availabilitySchema = z.object({
	timezone: z.string().refine(isTimeZone, "Unknown timezone"),
	weekly: z
		.array(weeklyRangeSchema)
		.refine(
			(ranges) =>
				new Set(ranges.map((range) => range.weekday)).size === ranges.length,
			"Only one range per day",
		),
});

export const closureSchema = z.object({
	date: z.iso.date("Use a date like 2026-12-24"),
	note: z
		.string()
		.trim()
		.max(
			AVAILABILITY_LIMITS.closureNote,
			`Max ${AVAILABILITY_LIMITS.closureNote} characters`,
		)
		.nullish()
		.transform((value) => value || null),
});

export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type ClosureInput = z.infer<typeof closureSchema>;
