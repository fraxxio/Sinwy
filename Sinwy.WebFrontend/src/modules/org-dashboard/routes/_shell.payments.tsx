import { hasPermission } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { CreditCardIcon, DownloadIcon } from "lucide-react";
import { PaymentFilters } from "#/modules/org-dashboard/components/payments/PaymentFilters";
import { PaymentsTable } from "#/modules/org-dashboard/components/payments/PaymentsTable";
import { PaymentTotals } from "#/modules/org-dashboard/components/payments/PaymentTotals";
import { paymentListQuery } from "#/modules/org-dashboard/lib/payment-queries";
import {
	changeRange,
	PAYMENTS_SEARCH_DEFAULTS,
	paymentsExportUrl,
	paymentsSearchSchema,
} from "#/modules/org-dashboard/lib/payment-search";
import { ORG_SECTIONS } from "#/modules/org-dashboard/lib/sections";
import { availabilityQuery } from "#/modules/org-dashboard/lib/service-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { PaymentsNotice } from "#/shared/components/payment/PaymentsNotice";
import { buttonVariants } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { requirePermission } from "#/shared/lib/auth/protected-route";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/payments",
)({
	beforeLoad: requirePermission(ORG_SECTIONS.payments.permission),
	validateSearch: paymentsSearchSchema,
	search: { middlewares: [stripSearchParams(PAYMENTS_SEARCH_DEFAULTS)] },
	staticData: { crumb: "Payments" },
	component: PaymentsPage,
});

function PaymentsPage() {
	const { organization, member } = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const availability = useQuery(availabilityQuery(organization.id));
	const list = useQuery(paymentListQuery(organization.id, search));
	const data = list.data;
	const range = {
		from: search.from ?? data?.from ?? "",
		to: search.to ?? data?.to ?? "",
	};

	return (
		<>
			<PageHeader
				title="Payments"
				description="What your customers owe and what you've collected."
				action={
					data && (
						<a
							href={paymentsExportUrl(organization.id, range)}
							download
							className={buttonVariants({ variant: "outline" })}
						>
							<DownloadIcon />
							Export CSV
						</a>
					)
				}
			/>
			<PaymentsNotice audience="organization" />
			{list.isError ? (
				<FieldError>{list.error.message}</FieldError>
			) : !data || availability.isPending ? (
				<Skeleton className="h-64 rounded-xl" />
			) : availability.isError ? (
				<FieldError>{availability.error.message}</FieldError>
			) : (
				<>
					<PaymentFilters
						from={range.from}
						to={range.to}
						onChange={(change) =>
							void navigate({
								search: { ...changeRange(range, change), page: 1 },
							})
						}
					/>
					{data.total === 0 ? (
						<EmptyState
							icon={<CreditCardIcon />}
							title="No payments in this range"
							description="Each booking with a price adds a payment here when it's made."
						/>
					) : (
						<>
							<PaymentTotals totals={data.totals} />
							<ContentBox className="p-4">
								<PaymentsTable
									items={data.items}
									total={data.total}
									timezone={availability.data.timezone}
									organizationId={organization.id}
									organizationSlug={organization.slug}
									canMarkPaid={hasPermission(member.roles, "payments:write")}
									page={search.page}
									onPageChange={(page) =>
										void navigate({ search: (prev) => ({ ...prev, page }) })
									}
								/>
							</ContentBox>
						</>
					)}
				</>
			)}
		</>
	);
}
