import { expect, it } from "bun:test";
import {
	formatAmountInput,
	formatMinorUnits,
	parseMinorUnits,
} from "../lib/money";

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

it("parses typed amounts into minor units", () => {
	expect(parseMinorUnits("25", "EUR")).toEqual({ ok: true, minor: 2500 });
	expect(parseMinorUnits("25.5", "EUR")).toEqual({ ok: true, minor: 2550 });
	expect(parseMinorUnits("25.50", "EUR")).toEqual({ ok: true, minor: 2550 });
	expect(parseMinorUnits(" 25,50 ", "EUR")).toEqual({ ok: true, minor: 2550 });
	expect(parseMinorUnits("0.07", "EUR")).toEqual({ ok: true, minor: 7 });
	expect(parseMinorUnits("19.99", "USD")).toEqual({ ok: true, minor: 1999 });
});

it("rejects more decimals than the currency has", () => {
	expect(parseMinorUnits("25.505", "EUR").ok).toBe(false);
	expect(parseMinorUnits("2500.5", "JPY").ok).toBe(false);
});

it("does not scale zero-decimal currencies when parsing", () => {
	expect(parseMinorUnits("2500", "JPY")).toEqual({ ok: true, minor: 2500 });
});

it("rejects input that isn't a plain amount", () => {
	for (const input of ["", "abc", "-5", "1e3", "€25", "25.5.0"])
		expect(parseMinorUnits(input, "EUR").ok).toBe(false);
});

it("formats minor units back into an editable amount", () => {
	expect(formatAmountInput(2550, "EUR")).toBe("25.50");
	expect(formatAmountInput(7, "EUR")).toBe("0.07");
	expect(formatAmountInput(2500, "JPY")).toBe("2500");
	expect(parseMinorUnits(formatAmountInput(12345, "KWD"), "KWD")).toEqual({
		ok: true,
		minor: 12345,
	});
});
