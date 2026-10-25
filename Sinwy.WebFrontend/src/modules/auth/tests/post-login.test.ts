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
	features: [],
	isOwner: true,
	suspended: false,
	draft: false,
	deletesAt: null,
	onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const draft = (id: string, overrides: Partial<OrganizationSummary> = {}) =>
	org(id, {
		status: "inactive",
		plan: null,
		draft: true,
		onboardingCompletedAt: null,
		...overrides,
	});

const inactive = (id: string, overrides: Partial<OrganizationSummary> = {}) =>
	org(id, { status: "inactive", plan: null, ...overrides });

const dashboard = (id: string) => ({
	to: "/$organizationSlug",
	params: { organizationSlug: `slug-${id}` },
});

const organizations = { to: "/account/organizations" };

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
		"another open org when the session's org is inactive",
		[org("a"), inactive("b")],
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
		"an open org over an owned draft",
		[org("a"), draft("b")],
		null,
		dashboard("a"),
	],
	[
		"Account → Organizations for an owner with only a draft",
		[draft("a")],
		null,
		organizations,
	],
	[
		"Account → Organizations for an owner with only inactive orgs",
		[inactive("a"), draft("b")],
		"a",
		organizations,
	],
	[
		"Account → Organizations for an owner whose only org is suspended",
		[inactive("a", { suspended: true })],
		null,
		organizations,
	],
	[
		"the account for staff with only inactive orgs",
		[draft("a", { isOwner: false }), inactive("b", { isOwner: false })],
		null,
		account,
	],
	[
		"the account for an owner whose only org is scheduled for deletion",
		[draft("a", { draft: false, deletesAt: "2026-11-24T12:00:00.000Z" })],
		null,
		account,
	],
	["the account for a user with no organizations", [], null, account],
] as const)("goes to %s", (_, organizations, activeOrgId, expected) => {
	expect<unknown>(
		postLoginDestination([...organizations], activeOrgId),
	).toEqual(expected);
});
