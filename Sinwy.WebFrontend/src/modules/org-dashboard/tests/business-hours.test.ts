import { expect, it } from "bun:test";
import {
	type BusinessHoursFormValues,
	businessHoursFormSchema,
	copyMondayToWeekdays,
	toAvailabilityInput,
	toBusinessHoursFormValues,
} from "../lib/business-hours";

const allClosed = toBusinessHoursFormValues({
	timezone: "Europe/Vilnius",
	weekly: [],
});

const withDays = (
	days: Record<number, [string, string]>,
): BusinessHoursFormValues => ({
	...allClosed,
	days: allClosed.days.map((day) => {
		const range = days[day.weekday];
		return range ? { ...day, open: true, start: range[0], end: range[1] } : day;
	}),
});

it("loads an organization without hours as seven closed days", () => {
	expect(allClosed.days.map((day) => [day.weekday, day.open])).toEqual([
		[1, false],
		[2, false],
		[3, false],
		[4, false],
		[5, false],
		[6, false],
		[7, false],
	]);
});

it("sends no rule for closed days and open days as typed", () => {
	const input = toAvailabilityInput(
		withDays({ 1: ["09:00", "17:00"], 6: ["10:15", "14:45"] }),
	);
	expect(input).toEqual({
		timezone: "Europe/Vilnius",
		weekly: [
			{ weekday: 1, start: "09:00", end: "17:00" },
			{ weekday: 6, start: "10:15", end: "14:45" },
		],
	});
});

it("loads saved hours back into the same form state", () => {
	const values = withDays({
		1: ["08:00", "16:30"],
		3: ["12:00", "20:00"],
		7: ["00:00", "23:45"],
	});
	expect(toBusinessHoursFormValues(toAvailabilityInput(values))).toEqual(
		values,
	);
});

it("copies Monday onto Tuesday to Friday and leaves the weekend", () => {
	const days = copyMondayToWeekdays(
		withDays({ 1: ["09:00", "17:00"], 6: ["10:00", "13:00"] }).days,
	);
	expect(days.filter((day) => day.open).map((day) => day.weekday)).toEqual([
		1, 2, 3, 4, 5, 6,
	]);
	expect(days[4]).toEqual({
		weekday: 5,
		open: true,
		start: "09:00",
		end: "17:00",
	});
	expect(days[5]?.start).toBe("10:00");
});

const issues = (values: BusinessHoursFormValues) => {
	const result = businessHoursFormSchema.safeParse(values);
	return result.success
		? []
		: result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

it("checks open days like the server and ignores closed ones", () => {
	expect(issues(withDays({ 1: ["17:00", "09:00"] }))).toEqual([
		["days.0.end", "End must be after start"],
	]);
	expect(issues(withDays({ 2: ["09:10", "17:00"] }))[0]?.[0]).toBe(
		"days.1.start",
	);
	expect(
		issues({
			...allClosed,
			days: allClosed.days.map((day) => ({ ...day, start: "", end: "" })),
		}),
	).toEqual([]);
});
