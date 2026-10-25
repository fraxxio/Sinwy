import { expect, it } from "bun:test";
import { hasCompletedSetup } from "#/shared/lib/organizations";
import { activeOrganizationDestination } from "../lib/funnel";

const organization = { id: "org-1", slug: "acme" };
const completedAt = new Date("2026-01-01");

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
			onboardingCompletedAt: completedAt,
		}),
	).toEqual({ to: "/$organizationSlug", params: { organizationSlug: "acme" } });
});

it("treats an organization as set up once onboarding is complete, whatever its status", () => {
	expect(hasCompletedSetup({ onboardingCompletedAt: completedAt })).toBe(true);
	expect(hasCompletedSetup({ onboardingCompletedAt: null })).toBe(false);
	expect(hasCompletedSetup({})).toBe(false);
});
