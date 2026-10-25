import type { PlanSlug } from "../plan/Plan";
import type { OrganizationStatus } from "./Organization";

/** One of the caller's organizations, as the switcher and Account → Organizations list them. */
export type OrganizationSummary = {
	id: string;
	name: string;
	slug: string;
	status: OrganizationStatus;
	suspended: boolean;
	plan: PlanSlug | null;
	isOwner: boolean;
	/** When it is purged, set once its owner's account is deleted; ISO date. */
	deletesAt: string | null;
	onboardingCompletedAt: string | null;
};
