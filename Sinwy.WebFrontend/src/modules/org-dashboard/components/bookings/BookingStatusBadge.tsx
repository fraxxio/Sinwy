import type { BookingStatus } from "@sinwy/shared";
import { Badge } from "#/shared/components/ui/badge";
import { cn } from "#/shared/lib/utils";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
	pending: "Pending",
	confirmed: "Confirmed",
	cancelled: "Cancelled",
	completed: "Completed",
	no_show: "No-show",
};

/** Colours shared by the badge and the calendar's blocks. */
export const BOOKING_STATUS_STYLES: Record<BookingStatus, string> = {
	pending:
		"border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200",
	confirmed:
		"border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
	cancelled:
		"border-border bg-muted text-muted-foreground line-through decoration-muted-foreground/60",
	completed: "border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-200",
	no_show: "border-border bg-muted/60 text-muted-foreground opacity-70",
};

/** A request nobody answered before its start; nothing expires it, so it is worked out on read. */
export const isExpiredRequest = (
	booking: { status: BookingStatus; startsAt: string },
	now = Date.now(),
) => booking.status === "pending" && Date.parse(booking.startsAt) <= now;

export function BookingStatusBadge({
	booking,
	className,
}: {
	booking: { status: BookingStatus; startsAt: string };
	className?: string;
}) {
	const expired = isExpiredRequest(booking);
	return (
		<Badge
			variant="outline"
			className={cn(BOOKING_STATUS_STYLES[booking.status], className)}
		>
			{expired ? "Expired request" : BOOKING_STATUS_LABELS[booking.status]}
		</Badge>
	);
}
