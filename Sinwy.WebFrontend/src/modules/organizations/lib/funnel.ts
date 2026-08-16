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
