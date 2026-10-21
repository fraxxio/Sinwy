import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CurrentPlanSection } from "#/modules/org-dashboard/components/billing/CurrentPlanSection";
import { InactivePlanSection } from "#/modules/org-dashboard/components/billing/InactivePlanSection";
import { ManageBillingSection } from "#/modules/org-dashboard/components/billing/ManageBillingSection";
import { ORG_SECTIONS } from "#/modules/org-dashboard/lib/sections";
import { ContentBox } from "#/shared/components/ContentBox";
import { PageHeader } from "#/shared/components/PageHeader";
import { useEntitlements } from "#/shared/lib/auth/entitlements";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute(
	"/$organizationSlug/_shell/settings/billing",
)({
	beforeLoad: requirePermission(ORG_SECTIONS.billing.permission),
	staticData: { crumb: "Billing" },
	validateSearch: z.object({
		change: z.literal("plan").optional().catch(undefined),
	}),
	component: BillingPage,
});

function BillingPage() {
	const { organization } = Route.useRouteContext();
	const { isActive } = useEntitlements();

	return (
		<>
			<PageHeader
				title="Billing"
				description="Your organization's plan, invoices and payment method."
			/>
			<ContentBox className="divide-y">
				{isActive ? (
					<CurrentPlanSection organizationId={organization.id} />
				) : (
					<InactivePlanSection organizationId={organization.id} />
				)}
				<ManageBillingSection />
			</ContentBox>
		</>
	);
}
