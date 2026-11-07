import type { Feature } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { LockIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { Button } from "#/shared/components/ui/button";
import { usePermissions } from "#/shared/lib/auth/permissions";
import { FEATURE_NAMES, getPlanName, minimumPlanFor } from "#/shared/lib/plans";

/** The plan is the owner's own, changed from their account; everyone else asks them. */
export function UpgradeAction() {
	const { can } = usePermissions();

	return can("billing:manage") ? (
		<Button
			size="sm"
			nativeButton={false}
			render={<Link to="/account/billing" search={{ change: "plan" }} />}
		>
			Upgrade plan
		</Button>
	) : (
		<p className="text-muted-foreground text-sm">Ask an owner to upgrade.</p>
	);
}

export function UpgradePrompt({ feature }: { feature: Feature }) {
	const plan = minimumPlanFor(feature);

	const description = plan
		? `Available on ${getPlanName(plan)} and above.`
		: "Not included in any plan yet.";

	return (
		<EmptyState
			icon={<LockIcon />}
			title={FEATURE_NAMES[feature]}
			description={description}
			action={plan && <UpgradeAction />}
		/>
	);
}
