import {
	FUNNEL_STEP_ORDER,
	FunnelStep,
	type PostLoginFlags,
	type UnfinishedOnboarding,
} from "@sinwy/shared";
import { FUNNEL_STEPS } from "#/modules/organizations/lib/funnel";

/**
 * Route ids the prompt stays quiet on, matched by whole segments: an entry
 * covers that route and everything under it, so `/auth` takes the whole module.
 * The funnel steps carry their own routes; the rest surround them.
 */
const FUNNEL_ROUTES = [
	"/auth",
	"/organizations/$id/onboarding",
	...FUNNEL_STEP_ORDER.map((step) => FUNNEL_STEPS[step].to),
];

function isFunnelRoute(routeId: string) {
	return FUNNEL_ROUTES.some(
		(route) => routeId === route || routeId.startsWith(`${route}/`),
	);
}

export function shouldPromptResume(
	flags: PostLoginFlags | null,
	routeId: string,
): UnfinishedOnboarding | null {
	const unfinished = flags?.unfinishedOnboarding;
	if (!unfinished) return null;
	if (isFunnelRoute(routeId)) return null;

	return unfinished;
}

export function resumePrompt(unfinished: UnfinishedOnboarding) {
	switch (unfinished.step) {
		case FunnelStep.Plan:
			return {
				title: "Finish setting up your organization",
				description: "Pick a plan to activate it.",
				action: "Choose a plan",
				to: FUNNEL_STEPS[unfinished.step].to,
				params: { id: unfinished.organizationId },
			} as const;
	}
}
