/**
 * The create → plan → pay funnel an organization goes through before it is
 * active. Values are the wire format; the keys are what code should reference.
 */
export const FunnelStep = {
	Create: "create-organization",
	Plan: "select-plan",
	Pay: "pay",
} as const;

export type FunnelStep = (typeof FunnelStep)[keyof typeof FunnelStep];

export const FUNNEL_STEP_ORDER = [
	FunnelStep.Create,
	FunnelStep.Plan,
	FunnelStep.Pay,
] as const;
