import type { CustomerPaymentDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { PaymentStatusBadge } from "#/shared/components/payment/PaymentStatusBadge";
import { formatShortDateIn, formatTimeIn } from "#/shared/lib/date";
import { formatMinorUnits } from "#/shared/lib/money";

/** Each row dated by its appointment, in its own organization's zone. */
export function CustomerPaymentList({
	payments,
}: {
	payments: CustomerPaymentDto[];
}) {
	return (
		<ul className="divide-y rounded-xl border">
			{payments.map((payment) => {
				const { timezone } = payment.organization;
				return (
					<li
						key={payment.id}
						className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 hover:bg-muted/50"
					>
						<div className="space-y-0.5">
							<Link
								to="/account/payments/$paymentId"
								params={{ paymentId: payment.id }}
								className="font-medium after:absolute after:inset-0"
							>
								{payment.serviceName} at {payment.organization.name}
							</Link>
							<p className="text-muted-foreground text-sm">
								{formatShortDateIn(payment.startsAt, timezone)},{" "}
								{formatTimeIn(payment.startsAt, timezone)}{" "}
								<span className="text-xs">({timezone})</span>
							</p>
						</div>
						<div className="flex items-center gap-3">
							<span className="text-sm tabular-nums">
								{formatMinorUnits(payment.amountMinor, payment.currency)}
							</span>
							<PaymentStatusBadge status={payment.status} />
						</div>
					</li>
				);
			})}
		</ul>
	);
}
