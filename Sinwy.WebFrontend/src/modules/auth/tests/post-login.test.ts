import { expect, it } from "bun:test";
import { postLoginDestination } from "../lib/post-login";

const orgs = [
	{ id: "a", status: "active" },
	{ id: "b", status: "active" },
	{ id: "c", status: "active" },
];

it("prefers the active organization", () => {
	expect(postLoginDestination(orgs, "b")).toEqual({
		to: "/organizations/$id/onboarding",
		params: { id: "b" },
	});
});

it("falls back to the last organization when none is active", () => {
	expect(postLoginDestination(orgs, null)).toEqual({
		to: "/organizations/$id/onboarding",
		params: { id: "c" },
	});
});

it("sends an unpaid (inactive) organization back to the plan page", () => {
	expect(postLoginDestination([{ id: "a", status: "inactive" }], "a")).toEqual({
		to: "/organizations/$id/plan",
		params: { id: "a" },
	});
});

it("sends users without organizations to Customer Mode", () => {
	expect(postLoginDestination([], null)).toEqual({ to: "/" });
});
