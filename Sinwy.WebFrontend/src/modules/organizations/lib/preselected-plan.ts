import { PLAN_SLUGS, type PlanSlug } from "@sinwy/shared";

const STORAGE_KEY = "sinwy.preselected-plan";

export function savePreselectedPlan(slug: PlanSlug) {
	localStorage.setItem(STORAGE_KEY, slug);
}

export function readPreselectedPlan(): PlanSlug | null {
	const stored = localStorage.getItem(STORAGE_KEY);
	return PLAN_SLUGS.find((slug) => slug === stored) ?? null;
}

export function clearPreselectedPlan() {
	localStorage.removeItem(STORAGE_KEY);
}
