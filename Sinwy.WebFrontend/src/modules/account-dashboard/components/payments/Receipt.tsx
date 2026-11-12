import type { CustomerPaymentDetailDto } from "@sinwy/shared";
import { receiptNumberOf } from "#/modules/account-dashboard/lib/receipt";
import { FlatCard } from "#/shared/components/FlatCard";
import {
	PAYMENT_PROVIDER_LABELS,
	PaymentStatusBadge,
} from "#/shared/components/payment/PaymentStatusBadge";
import { CardContent } from "#/shared/components/ui/card";
import { Separator } from "#/shared/components/ui/separator";
import { formatDateIn, formatTimeIn } from "#/shared/lib/date";
import { formatMinorUnits } from "#/shared/lib/money";

export function Receipt({ payment }: { payment: CustomerPaymentDetailDto }) {
	const { organization } = payment;
	const { timezone } = organization;

	return (
		<FlatCard className="print:border-0!">
			<CardContent className="space-y-4 print:px-3">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="space-y-0.5">
						<p className="font-semibold text-lg">{organization.name}</p>
						<p className="text-muted-foreground text-sm">
							Receipt no.{" "}
							<span className="font-mono">{receiptNumberOf(payment.id)}</span>
						</p>
					</div>
					<PaymentStatusBadge status={payment.status} />
				</div>
				<Separator />
				<dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
					<dt className="text-muted-foreground">Customer</dt>
					<dd>{payment.customerName}</dd>
					<dt className="text-muted-foreground">Service</dt>
					<dd>{payment.serviceName}</dd>
					<dt className="text-muted-foreground">Appointment</dt>
					<dd>
						{formatDateIn(payment.startsAt, timezone)},{" "}
						{formatTimeIn(payment.startsAt, timezone)}{" "}
						<span className="text-muted-foreground text-xs">({timezone})</span>
					</dd>
					<dt className="text-muted-foreground">Paid on</dt>
					<dd>
						{payment.paidAt
							? formatDateIn(payment.paidAt, timezone)
							: "Not paid yet"}
					</dd>
					{payment.status === "paid" && (
						<>
							<dt className="text-muted-foreground">Payment method</dt>
							<dd>{PAYMENT_PROVIDER_LABELS[payment.provider]}</dd>
						</>
					)}
				</dl>
				<Separator />
				<div className="flex items-baseline justify-between gap-4">
					<span className="font-medium">
						{payment.status === "paid" ? "Total paid" : "Amount due"}
					</span>
					<span className="font-semibold text-xl tabular-nums">
						{formatMinorUnits(payment.amountMinor, payment.currency)}
					</span>
				</div>
			</CardContent>
		</FlatCard>
	);
}
