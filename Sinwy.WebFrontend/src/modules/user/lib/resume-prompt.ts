import type { PostLoginFlags, UnfinishedOnboarding } from "@sinwy/shared";

/**
 * Route ids the prompt stays quiet on, matched by whole segments: an entry
 * covers that route and everything under it, so `/auth` takes the whole module.
 */
const FUNNEL_ROUTES = [
	"/auth",
	"/organizations/new",
	"/organizations/$id/plan",
	"/organizations/$id/onboarding",
	"/checkout/success",
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
		case "select-plan":
			return {
				title: "Finish setting up your organization",
				description: "Pick a plan to activate it.",
				action: "Choose a plan",
				to: "/organizations/$id/plan",
				params: { id: unfinished.organizationId },
			} as const;
	}
}
