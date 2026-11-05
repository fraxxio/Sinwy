import type { PaymentProvider, PaymentStatus } from "@sinwy/shared";
import { Badge } from "#/shared/components/ui/badge";
import { cn } from "#/shared/lib/utils";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
	pending: "Pending",
	paid: "Paid",
	void: "Void",
	refunded: "Refunded",
};

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
	pending:
		"border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200",
	paid: "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
	void: "border-border bg-muted text-muted-foreground",
	refunded: "border-border bg-muted text-muted-foreground",
};

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
	manual: "Paid at the business",
};

export function PaymentStatusBadge({
	status,
	className,
}: {
	status: PaymentStatus;
	className?: string;
}) {
	return (
		<Badge
			variant="outline"
			className={cn(PAYMENT_STATUS_STYLES[status], className)}
		>
			{PAYMENT_STATUS_LABELS[status]}
		</Badge>
	);
}
