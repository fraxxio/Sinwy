import type { Feature } from "@sinwy/shared";
import { Link, useParams } from "@tanstack/react-router";
import { LockIcon } from "lucide-react";
import { EmptyState } from "#/shared/components/EmptyState";
import { Button } from "#/shared/components/ui/button";
import { useEntitlements } from "#/shared/lib/auth/entitlements";
import { usePermissions } from "#/shared/lib/auth/permissions";
import { FEATURE_NAMES, getPlanName, minimumPlanFor } from "#/shared/lib/plans";

export function UpgradePrompt({ feature }: { feature: Feature }) {
	const { isActive } = useEntitlements();
	const { can } = usePermissions();
	const { organizationSlug } = useParams({ strict: false });
	const plan = minimumPlanFor(feature);

	// an inactive org needs to reactivate, not upgrade; the banner carries that CTA
	const description = !isActive
		? "Available once the organization has an active plan."
		: plan
			? `Available on ${getPlanName(plan)} and above.`
			: "Not included in any plan yet.";

	return (
		<EmptyState
			icon={<LockIcon />}
			title={FEATURE_NAMES[feature]}
			description={description}
			action={
				isActive &&
				plan &&
				(can("billing:manage") && organizationSlug ? (
					<Button
						size="sm"
						nativeButton={false}
						render={
							<Link
								to="/$organizationSlug/settings/billing"
								params={{ organizationSlug }}
								search={{ change: "plan" }}
							/>
						}
					>
						Upgrade plan
					</Button>
				) : (
					<p className="text-muted-foreground text-sm">
						Ask an owner to upgrade.
					</p>
				))
			}
		/>
	);
}
