import { expect, it } from "bun:test";
import { postLoginDestination } from "../lib/post-login";

const setUp = (id: string) => ({
	id,
	slug: `slug-${id}`,
	status: "active",
});

const orgs = [setUp("a"), setUp("b"), setUp("c")];

const owner = async () => true;
const staff = async () => false;

it("prefers the active organization", async () => {
	expect(await postLoginDestination(orgs, "b", owner)).toEqual({
		to: "/$organizationSlug",
		params: { organizationSlug: "slug-b" },
	});
});

it("falls back to the last organization when the active id is stale", async () => {
	expect(await postLoginDestination(orgs, "deleted-org", owner)).toEqual({
		to: "/$organizationSlug",
		params: { organizationSlug: "slug-c" },
	});
});

it("falls back to the last organization when none is active", async () => {
	expect(await postLoginDestination(orgs, null, owner)).toEqual({
		to: "/$organizationSlug",
		params: { organizationSlug: "slug-c" },
	});
});

const unpaid = [{ id: "a", slug: "slug-a", status: "inactive" }];

it("sends whoever can pay for an unpaid (inactive) organization back to the plan page", async () => {
	expect(await postLoginDestination(unpaid, "a", owner)).toEqual({
		to: "/organizations/$id/plan",
		params: { id: "a" },
	});
});

it("sends staff of an unpaid organization to its read-only dashboard", async () => {
	expect(await postLoginDestination(unpaid, "a", staff)).toEqual({
		to: "/$organizationSlug",
		params: { organizationSlug: "slug-a" },
	});
});

it("sends a lapsed organization to its read-only dashboard", async () => {
	expect(
		await postLoginDestination(
			[
				{
					id: "a",
					slug: "slug-a",
					status: "inactive",
					onboardingCompletedAt: new Date("2026-01-01"),
				},
			],
			"a",
			owner,
		),
	).toEqual({
		to: "/$organizationSlug",
		params: { organizationSlug: "slug-a" },
	});
});

it("sends users without organizations to Customer Mode", async () => {
	expect(await postLoginDestination([], null, owner)).toEqual({
		to: "/account",
	});
});
