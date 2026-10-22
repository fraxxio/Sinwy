import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CurrentPlanSection } from "#/modules/org-dashboard/components/billing/CurrentPlanSection";
import { InactivePlanSection } from "#/modules/org-dashboard/components/billing/InactivePlanSection";
import { InvoicesSection } from "#/modules/org-dashboard/components/billing/InvoicesSection";
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
	// a fresh page per organization: no previous org's invoices or dialog state
	remountDeps: ({ params }) => params.organizationSlug,
	staticData: { crumb: "Billing" },
	validateSearch: z.object({
		change: z.literal("plan").optional().catch(undefined),
		page: z.number().int().min(2).optional().catch(undefined),
	}),
	component: BillingPage,
});

function BillingPage() {
	const { organization } = Route.useRouteContext();
	const { isActive } = useEntitlements();
	const { change, page = 1 } = Route.useSearch();
	const navigate = Route.useNavigate();

	// the URL holds the dialog state so UpgradePrompt can deep-link into it
	const setChangePlanOpen = (open: boolean) =>
		void navigate({
			search: (prev) => ({ ...prev, change: open ? "plan" : undefined }),
			replace: true,
		});

	// pushed, so back returns to the previous page of invoices
	const setInvoicePage = (next: number) =>
		void navigate({
			search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }),
			resetScroll: false,
		});

	return (
		<>
			<PageHeader
				title="Billing"
				description="Your organization's plan, invoices and payment method."
			/>
			<ContentBox className="divide-y">
				{isActive ? (
					<CurrentPlanSection
						organizationId={organization.id}
						changePlanOpen={change === "plan"}
						onChangePlanOpenChange={setChangePlanOpen}
					/>
				) : (
					<InactivePlanSection organizationId={organization.id} />
				)}
				<InvoicesSection
					organizationId={organization.id}
					page={page}
					onPageChange={setInvoicePage}
				/>
				<ManageBillingSection />
			</ContentBox>
		</>
	);
}
