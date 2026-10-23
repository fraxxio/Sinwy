import { expect, it } from "bun:test";
import { hasCompletedSetup, isLapsed } from "#/shared/lib/organizations";
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

it("counts an inactive organization that finished onboarding as lapsed", () => {
	expect(
		isLapsed({ status: "inactive", onboardingCompletedAt: completedAt }),
	).toBe(true);
});

it("does not count an organization that never finished onboarding as lapsed", () => {
	expect(isLapsed({ status: "inactive", onboardingCompletedAt: null })).toBe(
		false,
	);
	expect(isLapsed({ status: "inactive" })).toBe(false);
});

it("does not count an active organization as lapsed", () => {
	expect(
		isLapsed({ status: "active", onboardingCompletedAt: completedAt }),
	).toBe(false);
});
