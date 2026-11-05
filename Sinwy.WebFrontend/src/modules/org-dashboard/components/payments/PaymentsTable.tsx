import { PAYMENT_LIMITS, type PaymentDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { MarkPaidDialog } from "#/modules/org-dashboard/components/payments/MarkPaidDialog";
import { PaymentStatusBadge } from "#/shared/components/payment/PaymentStatusBadge";
import { Button } from "#/shared/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/shared/components/ui/table";
import { formatShortDateIn, formatTimeIn } from "#/shared/lib/date";
import { formatMinorUnits } from "#/shared/lib/money";
import { cn } from "#/shared/lib/utils";

export function PaymentsTable({
	items,
	total,
	timezone,
	organizationId,
	organizationSlug,
	canMarkPaid,
	page,
	onPageChange,
}: {
	items: PaymentDto[];
	total: number;
	timezone: string;
	organizationId: string;
	organizationSlug: string;
	canMarkPaid: boolean;
	page: number;
	onPageChange: (page: number) => void;
}) {
	const [marking, setMarking] = useState<PaymentDto | null>(null);
	const pageSize = PAYMENT_LIMITS.listPageSize;
	const pages = Math.max(1, Math.ceil(total / pageSize));
	const first = (page - 1) * pageSize + 1;
	const last = first + items.length - 1;

	if (items.length === 0)
		return (
			<div className="py-10 text-center text-muted-foreground text-sm">
				This page is empty.
				<Button variant="link" onClick={() => onPageChange(1)}>
					Back to the first page
				</Button>
			</div>
		);

	return (
		<div className="space-y-3">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Created</TableHead>
						<TableHead>Customer</TableHead>
						<TableHead>Service</TableHead>
						<TableHead>Appointment</TableHead>
						<TableHead className="text-right">Amount</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Paid on</TableHead>
						<TableHead>
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((payment) => (
						<TableRow
							key={payment.id}
							className={cn(
								"relative",
								payment.status === "void" && "text-muted-foreground",
							)}
						>
							<TableCell>
								<Link
									to="/dashboard/$organizationSlug/bookings/$id"
									params={{ organizationSlug, id: payment.bookingId }}
									className="font-medium after:absolute after:inset-0"
								>
									{formatShortDateIn(payment.createdAt, timezone)}
								</Link>
							</TableCell>
							<TableCell>{payment.customerName}</TableCell>
							<TableCell>{payment.serviceName}</TableCell>
							<TableCell>
								{formatShortDateIn(payment.startsAt, timezone)}
								<div className="text-muted-foreground text-xs">
									{formatTimeIn(payment.startsAt, timezone)}
								</div>
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatMinorUnits(payment.amountMinor, payment.currency)}
							</TableCell>
							<TableCell>
								<PaymentStatusBadge status={payment.status} />
							</TableCell>
							<TableCell>
								{payment.paidAt
									? formatShortDateIn(payment.paidAt, timezone)
									: "—"}
							</TableCell>
							<TableCell className="text-right">
								{canMarkPaid && payment.status === "pending" && (
									<Button
										size="sm"
										variant="outline"
										className="relative z-10"
										onClick={() => setMarking(payment)}
									>
										Mark as paid
									</Button>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<div className="flex items-center justify-between gap-2 text-muted-foreground text-sm">
				<span>
					{first}–{last} of {total}
				</span>
				<div className="flex items-center gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Previous page"
						disabled={page <= 1}
						onClick={() => onPageChange(page - 1)}
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
						onClick={() => onPageChange(page + 1)}
					>
						<ChevronRightIcon />
					</Button>
				</div>
			</div>
			{marking && (
				<MarkPaidDialog
					organizationId={organizationId}
					payment={marking}
					onClose={() => setMarking(null)}
				/>
			)}
		</div>
	);
}
