import { FunnelStep } from "@sinwy/shared";

/**
 * How each funnel step presents itself. `Pay` runs on Polar, so it maps to the
 * page we own on the way back.
 */
export const FUNNEL_STEPS = {
	[FunnelStep.Create]: { label: "Create", to: "/organizations/new" },
	[FunnelStep.Plan]: { label: "Plan", to: "/organizations/$id/plan" },
	[FunnelStep.Pay]: { label: "Pay", to: "/checkout/success" },
} as const satisfies Record<FunnelStep, { label: string; to: string }>;

/** Finished setup once, so the first-time funnel no longer applies, whatever its billing status. */
export const hasCompletedSetup = (organization: {
	onboardingCompletedAt?: Date | null;
}) => Boolean(organization.onboardingCompletedAt);

/** Inactive after finishing setup: it belongs in the read-only dashboard, not the first-time funnel. */
export const isLapsed = (organization: {
	status: string;
	onboardingCompletedAt?: Date | null;
}) => organization.status !== "active" && hasCompletedSetup(organization);

/** Where an active organization goes next: onboarding until it is complete, then the dashboard. */
export function activeOrganizationDestination(organization: {
	id: string;
	slug: string;
	onboardingCompletedAt?: Date | null;
}) {
	if (!hasCompletedSetup(organization))
		return {
			to: "/organizations/$id/onboarding",
			params: { id: organization.id },
		} as const;

	return {
		to: "/$organizationSlug",
		params: { organizationSlug: organization.slug },
	} as const;
}
