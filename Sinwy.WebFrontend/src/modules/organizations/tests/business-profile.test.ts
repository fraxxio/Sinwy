import { expect, it } from "bun:test";
import { COUNTRY_OPTIONS } from "@sinwy/shared";
import { businessProfileSchema } from "../components/BusinessProfileForm";

const valid = {
	tagline: "Sharp cuts, no waiting",
	description: "A barbershop in the old town.",
	email: "hello@acme.dev",
	phone: "+370 600 00000",
	website: "acme.dev",
	city: "Vilnius",
	country: "LT",
};

const errorFor = (field: keyof typeof valid, value: string) => {
	const result = businessProfileSchema.safeParse({ ...valid, [field]: value });
	return result.success
		? null
		: (result.error.issues.find((issue) => issue.path[0] === field)?.message ??
				null);
};

it("accepts a filled in profile", () => {
	expect(businessProfileSchema.safeParse(valid).success).toBe(true);
});

it.each([
	"tagline",
	"description",
	"email",
	"phone",
	"country",
] as const)("requires %s", (field) => {
	expect(errorFor(field, "")).toMatch(/required/);
	expect(errorFor(field, "   ")).toMatch(/required/);
});

it.each(["city", "website"] as const)("keeps %s optional", (field) => {
	expect(errorFor(field, "")).toBeNull();
	expect(errorFor(field, "   ")).toBeNull();
});

it.each([
	"tagline",
	"description",
] as const)("asks for at least three characters in %s", (field) => {
	expect(errorFor(field, "ab")).toMatch(/at least 3/);
	expect(errorFor(field, "abc")).toBeNull();
});

it("rejects malformed emails", () => {
	expect(errorFor("email", "not-an-email")).toMatch(/valid email/);
	expect(errorFor("email", "someone@")).toMatch(/valid email/);
	expect(errorFor("email", "a@b.dev")).toBeNull();
});

it("accepts phone numbers however a country writes them", () => {
	for (const phone of [
		"+370 600 00000",
		"+1 (555) 010-1234",
		"020 7946 0958",
		"+81-3-1234-5678",
	])
		expect(errorFor("phone", phone)).toBeNull();
});

it("rejects phone numbers that are too short, too long or not numbers", () => {
	expect(errorFor("phone", "12345")).toMatch(/7 to 15 digits/);
	expect(errorFor("phone", "1234567890123456")).toMatch(/7 to 15 digits/);
	expect(errorFor("phone", "call me")).toMatch(/Use digits/);
});

it("only asks that a country was picked, the API checks which", () => {
	expect(errorFor("country", "")).toMatch(/required/);
	// the select can only produce codes from this list
	for (const option of [COUNTRY_OPTIONS[0], COUNTRY_OPTIONS.at(-1)])
		expect(errorFor("country", option?.value ?? "")).toBeNull();
});

it("checks the shape of a website when one is given", () => {
	expect(errorFor("website", "acme.dev")).toBeNull();
	expect(errorFor("website", "https://acme.dev/book")).toBeNull();
	expect(errorFor("website", "acme")).toMatch(/valid website/);
	expect(errorFor("website", "not a website")).toMatch(/valid website/);
});
