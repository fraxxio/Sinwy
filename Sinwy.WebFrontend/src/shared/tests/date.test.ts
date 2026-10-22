import { expect, it } from "bun:test";
import { formatDay } from "../lib/date";

it("formats a day", () => {
	// noon UTC so the day is the same in every test-runner timezone
	expect(formatDay("2026-11-21T12:00:00Z", "en-US")).toBe("Nov 21, 2026");
});

it("falls back to a dash for a date that doesn't parse", () => {
	expect(formatDay("", "en-US")).toBe("—");
	expect(formatDay("not a date", "en-US")).toBe("—");
});
