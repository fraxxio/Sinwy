import { OnboardingStep, type PostLoginFlags } from "@sinwy/shared";
import {
	findUnfinishedOnboardingOrganization,
	findUnpaidOwnedOrganization,
} from "./repository";

/**
 * Prompts the frontend should raise after login. Deliberately reads only
 * cached state: this is polled once per app load, so it must never reach for
 * Polar, reconciling billing stays on GET /organizations/:id/status, which
 * runs when the user actually re-enters the funnel.
 */
export const getPostLoginFlags = async (
	userId: string,
): Promise<PostLoginFlags> => {
	// billing comes first, an unpaid organization can do nothing else
	const unpaid = await findUnpaidOwnedOrganization(userId);
	if (unpaid)
		return {
			unfinishedOnboarding: {
				step: OnboardingStep.Plan,
				organizationId: unpaid,
			},
		};

	const unfinished = await findUnfinishedOnboardingOrganization(userId);
	return {
		unfinishedOnboarding: unfinished
			? { step: OnboardingStep.Profile, organizationId: unfinished }
			: null,
	};
};
