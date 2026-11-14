import { expect, it } from "bun:test";
import {
	BRAND_TEXT_DARK,
	BRAND_TEXT_LIGHT,
	brandTextColor,
} from "@sinwy/shared";
import { brandAttributes } from "../lib/branding";

it("picks the text color that contrasts more with the accent", () => {
	expect(brandTextColor("#0f766e")).toBe(BRAND_TEXT_LIGHT);
	expect(brandTextColor("#171717")).toBe(BRAND_TEXT_LIGHT);
	expect(brandTextColor("#ffffff")).toBe(BRAND_TEXT_DARK);
	expect(brandTextColor("#facc15")).toBe(BRAND_TEXT_DARK);
});

it("adds nothing for an unbranded organization", () => {
	expect(brandAttributes({ color: null, font: null })).toEqual({});
});

it("sets only the parts that are chosen", () => {
	expect(brandAttributes({ color: "#0f766e", font: null })).toEqual({
		style: { "--brand-color": "#0f766e", "--brand-on-color": BRAND_TEXT_LIGHT },
		"data-brand-color": "",
	} as never);
	const font = brandAttributes({ color: null, font: "classic" });
	expect(font["data-brand-font"]).toBe("");
	expect(font["data-brand-color"]).toBeUndefined();
	expect(font.style).toEqual({
		"--brand-font": '"Lora Variable", ui-serif, Georgia, serif',
	} as never);
});
