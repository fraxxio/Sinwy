import { expect, it } from "bun:test";
import { formatMinorUnits } from "../lib/money";

it("scales two-decimal currencies by 100", () => {
	expect(formatMinorUnits(4800, "USD", "en-US")).toBe("$48.00");
	expect(formatMinorUnits(123456, "USD", "en-US")).toBe("$1,234.56");
});

it("does not scale zero-decimal currencies", () => {
	expect(formatMinorUnits(4800, "JPY", "en-US")).toBe("¥4,800");
});

it("formats zero", () => {
	expect(formatMinorUnits(0, "EUR", "en-US")).toBe("€0.00");
});

it("falls back to a dash for a currency Intl can't format", () => {
	expect(formatMinorUnits(4800, "", "en-US")).toBe("—");
	expect(formatMinorUnits(4800, "dollars", "en-US")).toBe("—");
});

it("scales three-decimal currencies by 1000", () => {
	expect(formatMinorUnits(12345, "KWD", "en-US")).toBe("KWD\u00a012.345");
});
