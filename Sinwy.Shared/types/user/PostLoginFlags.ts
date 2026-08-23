import { FunnelStep } from "../organization/FunnelStep";

/**
 * The steps a user can be sent back to. `Create` has no organization to resume
 * and `Pay` belongs to Polar, so the funnel contributes billing only; once an
 * organization is paid for, its own setup wizard takes over.
 */
export const OnboardingStep = {
	Plan: FunnelStep.Plan,
	Profile: "business-profile",
} as const;

export type OnboardingStep =
	(typeof OnboardingStep)[keyof typeof OnboardingStep];

export type UnfinishedOnboarding = {
	step: OnboardingStep;
	organizationId: string;
};

/**
 * Everything the frontend needs to decide whether to prompt the user after
 * login, in one read. Named keys rather than a list: a new flag is a new key,
 * so existing consumers keep their types.
 */
export type PostLoginFlags = {
	unfinishedOnboarding: UnfinishedOnboarding | null;
};
