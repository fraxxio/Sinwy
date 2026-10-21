import type { Feature } from "@sinwy/shared";
import type { ReactNode } from "react";
import { UpgradePrompt } from "#/shared/components/UpgradePrompt";
import { useEntitlements } from "#/shared/lib/auth/entitlements";

/** Renders children when the organization's plan includes the feature. Gate on features, never on plan slugs. */
export function PlanGate({
	feature,
	children,
	fallback,
	mode = "prompt",
}: {
	feature: Feature;
	children?: ReactNode;
	fallback?: ReactNode;
	mode?: "prompt" | "hide";
}) {
	const { has } = useEntitlements();
	if (has(feature)) return children;
	if (mode === "hide") return null;
	return fallback ?? <UpgradePrompt feature={feature} />;
}
