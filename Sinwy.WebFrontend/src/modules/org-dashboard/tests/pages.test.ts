import { expect, it } from "bun:test";
import { pageSlugSchema } from "@sinwy/shared";
import { slugFromTitle } from "../lib/pages";

it("derives an address from a title", () => {
	expect(slugFromTitle("About us")).toBe("about-us");
	expect(slugFromTitle("  Our   Services & Prices!  ")).toBe(
		"our-services-prices",
	);
	expect(slugFromTitle("2026 offers")).toBe("2026-offers");
});

it("drops accents and folds letters that don't decompose", () => {
	expect(slugFromTitle("Über uns")).toBe("uber-uns");
	expect(slugFromTitle("Café Crème")).toBe("cafe-creme");
	expect(slugFromTitle("Kirpėjų paslaugos")).toBe("kirpeju-paslaugos");
	expect(slugFromTitle("Straße Æsir Łódź")).toBe("strasse-aesir-lodz");
});

it("moves off reserved addresses", () => {
	expect(slugFromTitle("Book")).toBe("book-page");
	expect(slugFromTitle("S")).toBe("s-page");
	expect(slugFromTitle("Book now")).toBe("book-now");
});

it("keeps within the length limit without a trailing hyphen", () => {
	const slug = slugFromTitle(`${"a".repeat(59)} b`);
	expect(slug).toBe("a".repeat(59));
	expect(pageSlugSchema.safeParse(slugFromTitle("x ".repeat(80))).success).toBe(
		true,
	);
});

it("gives nothing for a title with no letters or digits", () => {
	expect(slugFromTitle("!!! ???")).toBe("");
});
