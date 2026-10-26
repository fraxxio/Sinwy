import type { PlanSlug } from "../plan/Plan";
import type { Feature } from "../plan/PlanFeatures";
import type { OrganizationStatus } from "./Organization";

/** One of the caller's organizations, as the switcher and Account → Organizations list them. */
export type OrganizationSummary = {
	id: string;
	name: string;
	slug: string;
	status: OrganizationStatus;
	suspended: boolean;
	/** Never finished setup and holds no slot: created at the cap or before a plan. */
	draft: boolean;
	/** The tier's name, for the owner and admins only, and only while active. */
	plan: PlanSlug | null;
	/** What the tier includes while active, for every member. */
	features: readonly Feature[];
	isOwner: boolean;
	/** The owner's last payment failed and Polar is retrying it; only ever true for the owner. */
	paymentFailed: boolean;
	/** When it is purged, set once its owner's account is deleted; ISO date. */
	deletesAt: string | null;
	onboardingCompletedAt: string | null;
};
