import type { FunnelStep } from "../organization/FunnelStep";

/**
 * The funnel steps a user can be sent back to. `Create` has no organization to
 * resume and `Pay` belongs to Polar, so billing is the only one representable
 * today; an organization that is already `active` has nothing left to resume
 * until organization onboarding tracks its own completion.
 */
export type OnboardingStep = typeof FunnelStep.Plan;

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
