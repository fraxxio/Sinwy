import { PAYMENT_LIMITS } from "@sinwy/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	CreditCardIcon,
} from "lucide-react";
import { z } from "zod";
import { CustomerPaymentList } from "#/modules/account-dashboard/components/payments/CustomerPaymentList";
import { accountPaymentsQuery } from "#/modules/account-dashboard/lib/payment-queries";
import { ContentBox } from "#/shared/components/ContentBox";
import { EmptyState } from "#/shared/components/EmptyState";
import { PageHeader } from "#/shared/components/PageHeader";
import { PaymentsNotice } from "#/shared/components/payment/PaymentsNotice";
import { Button } from "#/shared/components/ui/button";
import { FieldError } from "#/shared/components/ui/field";
import { Skeleton } from "#/shared/components/ui/skeleton";

const searchSchema = z.object({
	page: z.coerce.number().int().min(2).optional().catch(undefined),
});

export const Route = createFileRoute("/account/_shell/payments/")({
	validateSearch: searchSchema,
	component: PaymentsPage,
});

function PaymentsPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const page = search.page ?? 1;
	const payments = useQuery(accountPaymentsQuery(page));

	const pageSize = PAYMENT_LIMITS.customerListPageSize;
	const pages = Math.max(1, Math.ceil((payments.data?.total ?? 0) / pageSize));
	const goToPage = (next: number) =>
		void navigate({
			search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }),
		});

	return (
		<>
			<PageHeader
				title="Payments"
				description="What's due and what you've paid for your bookings."
			/>
			<ContentBox className="gap-4">
				<PaymentsNotice audience="customer" />
				{payments.isError ? (
					<FieldError>{payments.error.message}</FieldError>
				) : payments.isPending ? (
					<Skeleton className="h-48 rounded-md" />
				) : payments.data.items.length === 0 ? (
					page > 1 ? (
						<p className="py-10 text-center text-muted-foreground text-sm">
							This page is empty.
							<Button variant="link" onClick={() => goToPage(1)}>
								Back to the first page
							</Button>
						</p>
					) : (
						<EmptyState
							icon={<CreditCardIcon />}
							title="No payments yet"
							description="Bookings with a price show up here, with what's due and what the business has marked as paid."
							className="border-none"
						/>
					)
				) : (
					<>
						<CustomerPaymentList payments={payments.data.items} />
						{pages > 1 && (
							<div className="flex items-center justify-end gap-1 text-muted-foreground text-sm">
								<Button
									variant="outline"
									size="icon-sm"
									aria-label="Previous page"
									disabled={page <= 1}
									onClick={() => goToPage(page - 1)}
								>
									<ChevronLeftIcon />
								</Button>
								<span className="px-2 tabular-nums">
									Page {page} of {pages}
								</span>
								<Button
									variant="outline"
									size="icon-sm"
									aria-label="Next page"
									disabled={page >= pages}
									onClick={() => goToPage(page + 1)}
								>
									<ChevronRightIcon />
								</Button>
							</div>
						)}
					</>
				)}
			</ContentBox>
		</>
	);
}
