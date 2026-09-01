import { expect, it } from "bun:test";
import { postLoginDestination } from "../lib/post-login";

const setUp = (id: string) => ({
	id,
	slug: `slug-${id}`,
	status: "active",
});

const orgs = [setUp("a"), setUp("b"), setUp("c")];

it("prefers the active organization", () => {
	expect(postLoginDestination(orgs, "b")).toEqual({
		to: "/$organizationSlug",
		params: { organizationSlug: "slug-b" },
	});
});

it("falls back to the last organization when the active id is stale", () => {
	expect(postLoginDestination(orgs, "deleted-org")).toEqual({
		to: "/$organizationSlug",
		params: { organizationSlug: "slug-c" },
	});
});

it("falls back to the last organization when none is active", () => {
	expect(postLoginDestination(orgs, null)).toEqual({
		to: "/$organizationSlug",
		params: { organizationSlug: "slug-c" },
	});
});

it("sends an unpaid (inactive) organization back to the plan page", () => {
	expect(
		postLoginDestination(
			[{ id: "a", slug: "slug-a", status: "inactive" }],
			"a",
		),
	).toEqual({
		to: "/organizations/$id/plan",
		params: { id: "a" },
	});
});

it("sends users without organizations to Customer Mode", () => {
	expect(postLoginDestination([], null)).toEqual({ to: "/account" });
});
