import { expect, test } from "bun:test";
import { slugify, uniqueSlug } from "@backend/modules/organizations/utils";

test("basic slugify", () => {
	expect(slugify("My Cool Org")).toBe("my-cool-org");
});

test("unicode and symbol-heavy names", () => {
	expect(slugify("Café & Co. — Ltd!")).toBe("cafe-co-ltd");
	expect(slugify("  Über---Straße  ")).toBe("uber-stra-e");
});

test("name that strips to empty falls back", () => {
	expect(slugify("!!!")).toBe("org");
	expect(slugify("日本語")).toBe("org");
});

test("collision → suffixed slug", async () => {
	const taken = new Set(["acme"]);
	const slug = await uniqueSlug("Acme", async (s) => taken.has(s));
	expect(slug).toMatch(/^acme-[a-z0-9]{6}$/);
});

test("no collision → plain slug", async () => {
	expect(await uniqueSlug("Acme", async () => false)).toBe("acme");
});
