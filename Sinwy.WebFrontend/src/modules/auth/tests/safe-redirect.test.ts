import { expect, it } from "bun:test";
import { registerCallbackURL } from "../lib/useRegister";

it("uses a relative redirect as the verification callback", () => {
	expect(registerCallbackURL({ redirect: "/invite/abc" })).toBe("/invite/abc");
	expect(
		registerCallbackURL({ source: "business", redirect: "/invite/abc" }),
	).toBe("/invite/abc");
});

it("ignores redirects that could leave the site", () => {
	for (const redirect of [
		"https://evil.example",
		"//evil.example",
		"/\\evil.example",
		"/\t/evil.example",
		"/\n/evil.example",
		"javascript:alert(1)",
		"invite/abc",
		"",
	]) {
		expect(registerCallbackURL({ redirect })).toBe("/auth/postlogin");
	}
	expect(
		registerCallbackURL({ source: "business", redirect: "//evil.example" }),
	).toBe("/organizations/new");
});
