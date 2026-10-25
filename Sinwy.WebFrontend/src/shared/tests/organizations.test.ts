import { expect, it } from "bun:test";
import type { OrganizationSummary } from "@sinwy/shared";
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
	plan: null,
	isOwner: true,
	scheduledForDeletion: false,
	onboardingCompletedAt: null,
	...overrides,
});

const completed = { onboardingCompletedAt: "2026-01-01T00:00:00.000Z" };

it.each([
	["a never-paid org into the funnel", org(), {}],
	["a lapsed org to renew", org(completed), { intent: "renew" }],
	["a suspended org to resume", org({ suspended: true }), { intent: "renew" }],
	[
		"a suspended org that finished setup to resume",
		org({ suspended: true, ...completed }),
		{ intent: "renew" },
	],
] as const)("leads the owner of %s on the plan page", (_, organization, search) => {
	expect(reactivationLink(organization)).toMatchObject({
		to: "/organizations/$id/plan",
		params: { id: "org-1" },
		search,
	});
});

it("leads nobody else anywhere, and nobody once it is scheduled for deletion", () => {
	expect(reactivationLink(org({ isOwner: false, suspended: true }))).toBeNull();
	expect(reactivationLink(org({ scheduledForDeletion: true }))).toBeNull();
});

it("tells a suspended org from one without a plan, scheduled deletion first", () => {
	expect(closedOrganizationReason(org({ suspended: true }))).toBe(
		"This organization is suspended",
	);
	expect(closedOrganizationReason(org())).toBe(
		"This organization has no active plan",
	);
	expect(
		closedOrganizationReason(
			org({ suspended: true, scheduledForDeletion: true }),
		),
	).toBe("This organization is scheduled for deletion");
	expect(closedOrganizationBadge(org({ suspended: true }))).toBe("Suspended");
	expect(closedOrganizationBadge(org())).toBe("Inactive");
});
