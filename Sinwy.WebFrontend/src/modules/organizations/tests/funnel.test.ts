import { expect, it } from "bun:test";
import { activeOrganizationDestination } from "../lib/funnel";

const organization = { id: "org-1", slug: "acme" };

it("sends an organization that has not finished onboarding to onboarding", () => {
	expect(
		activeOrganizationDestination({
			...organization,
			onboardingCompletedAt: null,
		}),
	).toEqual({ to: "/organizations/$id/onboarding", params: { id: "org-1" } });
});

it("sends an organization that finished onboarding to its dashboard", () => {
	expect(
		activeOrganizationDestination({
			...organization,
			onboardingCompletedAt: new Date("2026-01-01"),
		}),
	).toEqual({ to: "/$organizationSlug", params: { organizationSlug: "acme" } });
});
