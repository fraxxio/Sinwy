import { expect, test } from "bun:test";
import { addDaysToDate, startOfLocalDate } from "../localDate";

const localDate = (instant: Date, timezone: string) =>
	new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(instant);

// Santiago's clocks jump from 00:00 to 01:00 in September, so some days have no midnight
test.each([
	["Europe/Vilnius", "2026-03-29"],
	["Europe/Vilnius", "2026-10-25"],
	["America/Santiago", "2026-09-06"],
	["America/Santiago", "2026-04-05"],
	["Asia/Kolkata", "2026-11-02"],
	["UTC", "2026-11-02"],
])("%s: %s starts at its first instant", (timezone, date) => {
	for (const day of [-1, 0, 1].map((offset) => addDaysToDate(date, offset))) {
		const start = startOfLocalDate(day, timezone);
		expect(localDate(start, timezone)).toBe(day);
		expect(localDate(new Date(start.getTime() - 1), timezone)).toBe(
			addDaysToDate(day, -1),
		);
	}
});
