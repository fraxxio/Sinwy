import type { PlanSlug } from "../plan/Plan";
import type { OrganizationStatus } from "./Organization";

export type OrganizationSummary = {
	id: string;
	name: string;
	slug: string;
	status: OrganizationStatus;
	plan: PlanSlug | null;
};
