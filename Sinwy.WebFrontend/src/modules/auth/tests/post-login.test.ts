import { expect, it } from "bun:test";
import type { OrganizationSummary } from "@sinwy/shared";
import { postLoginDestination } from "../lib/post-login";

const org = (
	id: string,
	overrides: Partial<OrganizationSummary> = {},
): OrganizationSummary => ({
	id,
	name: id,
	slug: `slug-${id}`,
	status: "active",
	plan: "starter",
	isOwner: true,
	suspended: false,
	deletesAt: null,
	onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const neverPaid = (id: string, overrides: Partial<OrganizationSummary> = {}) =>
	org(id, {
		status: "inactive",
		plan: null,
		onboardingCompletedAt: null,
		...overrides,
	});

const lapsed = (id: string, overrides: Partial<OrganizationSummary> = {}) =>
	org(id, { status: "inactive", plan: null, ...overrides });

const dashboard = (id: string) => ({
	to: "/$organizationSlug",
	params: { organizationSlug: `slug-${id}` },
});

const planPage = (id: string) => ({
	to: "/organizations/$id/plan",
	params: { id },
});

const account = { to: "/account" };

it.each([
	[
		"the session's active organization",
		[org("a"), org("b")],
		"a",
		dashboard("a"),
	],
	[
		"the newest open org when the session has none",
		[org("a"), org("b")],
		null,
		dashboard("b"),
	],
	[
		"the newest open org when the session's id is stale",
		[org("a"), org("b")],
		"gone",
		dashboard("b"),
	],
	[
		"another open org when the session's org lapsed",
		[org("a"), lapsed("b")],
		"b",
		dashboard("a"),
	],
	[
		"an open org over one scheduled for deletion",
		[org("a"), org("b", { deletesAt: "2026-11-24T12:00:00.000Z" })],
		"b",
		dashboard("a"),
	],
	[
		"an open org over an owned never-paid one",
		[org("a"), neverPaid("b")],
		null,
		dashboard("a"),
	],
	[
		"the plan page for an owner with only a never-paid org",
		[lapsed("a"), neverPaid("b")],
		"a",
		planPage("b"),
	],
	[
		"the account for an owner with only lapsed orgs",
		[lapsed("a")],
		"a",
		account,
	],
	[
		"the account for an owner whose only org is suspended before finishing setup",
		[neverPaid("a", { suspended: true })],
		null,
		account,
	],
	[
		"the account for staff with only inactive orgs",
		[neverPaid("a", { isOwner: false }), lapsed("b", { isOwner: false })],
		null,
		account,
	],
	[
		"the account for an owner whose never-paid org is scheduled for deletion",
		[neverPaid("a", { deletesAt: "2026-11-24T12:00:00.000Z" })],
		null,
		account,
	],
	["the account for a user with no organizations", [], null, account],
] as const)("goes to %s", (_, organizations, activeOrgId, expected) => {
	expect<unknown>(
		postLoginDestination([...organizations], activeOrgId),
	).toEqual(expected);
});
