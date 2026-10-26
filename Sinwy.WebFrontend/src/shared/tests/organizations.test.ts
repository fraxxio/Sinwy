import { expect, it } from "bun:test";
import type { OrganizationSummary } from "@sinwy/shared";
import { formatDay } from "../lib/date";
import {
	closedOrganizationBadge,
	closedOrganizationReason,
	reactivationLink,
} from "../lib/organizations";

const org = (
	overrides: Partial<OrganizationSummary> = {},
): OrganizationSummary => ({
	id: "org-1",
	name: "Acme",
	slug: "acme",
	status: "inactive",
	suspended: false,
	draft: false,
	plan: null,
	features: [],
	isOwner: true,
	paymentFailed: false,
	deletesAt: null,
	onboardingCompletedAt: null,
	...overrides,
});

it.each([
	["a draft", org({ draft: true })],
	["an inactive org", org()],
	["a suspended org", org({ suspended: true })],
] as const)("leads the owner of %s to Account → Organizations", (_, organization) => {
	expect(reactivationLink(organization)).toMatchObject({
		to: "/account/organizations",
	});
});

it("leads nobody else anywhere, and nobody once it is scheduled for deletion", () => {
	expect(reactivationLink(org({ isOwner: false, suspended: true }))).toBeNull();
	expect(
		reactivationLink(org({ deletesAt: "2026-11-24T12:00:00.000Z" })),
	).toBeNull();
});

it("tells suspended, draft and inactive orgs apart, scheduled deletion first", () => {
	expect(closedOrganizationReason(org({ suspended: true }))).toBe(
		"This organization is suspended",
	);
	expect(closedOrganizationReason(org({ draft: true }))).toBe(
		"This organization is still a draft",
	);
	expect(closedOrganizationReason(org())).toBe("This organization is inactive");
	expect(
		closedOrganizationReason(
			org({ suspended: true, deletesAt: "2026-11-24T12:00:00.000Z" }),
		),
	).toBe(
		`This organization will be deleted on ${formatDay("2026-11-24T12:00:00.000Z")}`,
	);
	expect(closedOrganizationBadge(org({ suspended: true }))).toBe("Suspended");
	expect(
		closedOrganizationBadge(
			org({ suspended: true, deletesAt: "2026-11-24T12:00:00.000Z" }),
		),
	).toBe("Scheduled for deletion");
	expect(closedOrganizationBadge(org({ draft: true }))).toBe("Draft");
	expect(closedOrganizationBadge(org())).toBe("Inactive");
});
