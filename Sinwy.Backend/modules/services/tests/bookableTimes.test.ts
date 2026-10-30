import { describe, expect, test } from "bun:test";
import {
	BOOKABLE_TIME_STEP_MINUTES,
	type BookableTimesInput,
	bookableTimes,
} from "../bookableTimes";

// 2026-01-05 is a Monday
const base: BookableTimesInput = {
	timezone: "UTC",
	weekly: [{ weekday: 1, start: "09:00", end: "12:00" }],
	closures: [],
	busy: [],
	durationMinutes: 60,
	bufferBeforeMinutes: 0,
	bufferAfterMinutes: 0,
	from: "2026-01-05",
	to: "2026-01-05",
	now: new Date("2026-01-01T00:00:00Z"),
	minNoticeMinutes: 0,
	stepMinutes: BOOKABLE_TIME_STEP_MINUTES,
};

const at = (date: string, clocks: string[]) =>
	clocks.map((clock) => `${date}T${clock}:00.000Z`);

const cases: {
	name: string;
	input: Partial<BookableTimesInput>;
	expected: string[];
}[] = [
	{
		name: "every quarter hour where the service fits; 11:15 would end after 12:00",
		input: {},
		expected: at("2026-01-05", [
			"09:00",
			"09:15",
			"09:30",
			"09:45",
			"10:00",
			"10:15",
			"10:30",
			"10:45",
			"11:00",
		]),
	},
	{
		name: "hours opening off the step start at the next quarter hour",
		input: {
			weekly: [{ weekday: 1, start: "09:10", end: "10:30" }],
		},
		expected: at("2026-01-05", ["09:15", "09:30"]),
	},
	{
		name: "a weekday without hours has no times",
		input: { weekly: [{ weekday: 2, start: "09:00", end: "12:00" }] },
		expected: [],
	},
	{
		name: "a closed date has no times",
		input: { closures: ["2026-01-05"] },
		expected: [],
	},
	{
		name: "buffered window can't touch busy time, but may end where it starts",
		input: {
			weekly: [{ weekday: 1, start: "08:00", end: "13:00" }],
			busy: [
				{
					start: new Date("2026-01-05T10:00:00Z"),
					end: new Date("2026-01-05T11:00:00Z"),
				},
			],
			bufferBeforeMinutes: 15,
			bufferAfterMinutes: 15,
		},
		expected: at("2026-01-05", [
			"08:00",
			"08:15",
			"08:30",
			"08:45",
			"11:15",
			"11:30",
			"11:45",
			"12:00",
		]),
	},
	{
		name: "nothing before now",
		input: { now: new Date("2026-01-05T10:07:00Z") },
		expected: at("2026-01-05", ["10:15", "10:30", "10:45", "11:00"]),
	},
	{
		name: "minimum notice pushes the first time past now",
		input: {
			now: new Date("2026-01-05T10:07:00Z"),
			minNoticeMinutes: 60,
		},
		expected: [],
	},
	{
		name: "minimum notice keeps times after now + notice",
		input: {
			now: new Date("2026-01-05T09:07:00Z"),
			minNoticeMinutes: 60,
		},
		expected: at("2026-01-05", ["10:15", "10:30", "10:45", "11:00"]),
	},
	{
		name: "a range of dates walks each one",
		input: {
			weekly: [
				{ weekday: 1, start: "09:00", end: "10:00" },
				{ weekday: 3, start: "14:00", end: "15:00" },
			],
			from: "2026-01-04",
			to: "2026-01-07",
		},
		expected: [...at("2026-01-05", ["09:00"]), ...at("2026-01-07", ["14:00"])],
	},
	{
		name: "DST start in Vilnius skips the missing 03:00–03:59",
		input: {
			timezone: "Europe/Vilnius",
			weekly: [{ weekday: 7, start: "02:00", end: "05:00" }],
			durationMinutes: 15,
			from: "2026-03-29",
			to: "2026-03-29",
		},
		// 02:xx is +02:00, 04:xx is +03:00
		expected: at("2026-03-29", [
			"00:00",
			"00:15",
			"00:30",
			"00:45",
			"01:00",
			"01:15",
			"01:30",
			"01:45",
		]),
	},
	{
		name: "a closing time inside the DST gap closes at its earlier reading",
		input: {
			timezone: "Europe/Vilnius",
			weekly: [{ weekday: 7, start: "02:00", end: "03:30" }],
			durationMinutes: 30,
			from: "2026-03-29",
			to: "2026-03-29",
		},
		// 03:30 read at +03:00 is 02:30 at +02:00
		expected: at("2026-03-29", ["00:00"]),
	},
	{
		name: "DST end in Vilnius gives each wall time once, the first 03:xx",
		input: {
			timezone: "Europe/Vilnius",
			weekly: [{ weekday: 7, start: "02:00", end: "05:00" }],
			from: "2026-10-25",
			to: "2026-10-25",
		},
		// 02:xx and the first 03:xx are +03:00, 04:00 is +02:00
		expected: [
			...at("2026-10-24", ["23:00", "23:15", "23:30", "23:45"]),
			...at("2026-10-25", ["00:00", "00:15", "00:30", "00:45", "02:00"]),
		],
	},
	{
		name: "Auckland hours crossing midnight UTC stay on their local date",
		input: {
			timezone: "Pacific/Auckland",
			weekly: [
				{ weekday: 1, start: "12:00", end: "14:00" },
				{ weekday: 7, start: "12:00", end: "14:00" },
			],
		},
		// Monday 2026-01-05 at +13:00
		expected: [
			...at("2026-01-04", ["23:00", "23:15", "23:30", "23:45"]),
			...at("2026-01-05", ["00:00"]),
		],
	},
];

describe("bookableTimes", () => {
	for (const { name, input, expected } of cases)
		test(name, () => {
			const times = bookableTimes({ ...base, ...input });
			expect(times.map((time) => time.toISOString())).toEqual(expected);
		});
});
