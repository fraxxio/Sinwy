import { BOOKING_LIMITS, type BookingListDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { BookingStatusBadge } from "#/modules/org-dashboard/components/bookings/BookingStatusBadge";
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

export function BookingsList({
	data,
	timezone,
	organizationSlug,
	page,
	onPageChange,
}: {
	data: BookingListDto;
	timezone: string;
	organizationSlug: string;
	page: number;
	onPageChange: (page: number) => void;
}) {
	const pageSize = BOOKING_LIMITS.listPageSize;
	const pages = Math.max(1, Math.ceil(data.total / pageSize));
	const first = (page - 1) * pageSize + 1;
	const last = first + data.items.length - 1;

	if (data.items.length === 0)
		return (
			<div className="py-10 text-center text-muted-foreground text-sm">
				{page > 1 ? (
					<>
						This page is empty.
						<Button variant="link" onClick={() => onPageChange(1)}>
							Back to the first page
						</Button>
					</>
				) : (
					"No bookings match these filters."
				)}
			</div>
		);

	return (
		<div className="space-y-3">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Date and time</TableHead>
						<TableHead>Customer</TableHead>
						<TableHead>Service</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="text-right">Price</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.items.map((booking) => (
						<TableRow
							key={booking.id}
							className={cn(
								"relative",
								booking.status === "no_show" && "opacity-60",
							)}
						>
							<TableCell>
								<Link
									to="/dashboard/$organizationSlug/bookings/$id"
									params={{ organizationSlug, id: booking.id }}
									className="font-medium after:absolute after:inset-0"
								>
									{formatShortDateIn(booking.startsAt, timezone)}
								</Link>
								<div className="text-muted-foreground text-xs">
									{formatTimeIn(booking.startsAt, timezone)}–
									{formatTimeIn(booking.endsAt, timezone)}
								</div>
							</TableCell>
							<TableCell>
								<div>{booking.customerName}</div>
								<div className="text-muted-foreground text-xs">
									{booking.customerEmail ?? booking.customerPhone}
								</div>
							</TableCell>
							<TableCell>{booking.serviceName}</TableCell>
							<TableCell>
								<BookingStatusBadge booking={booking} />
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatMinorUnits(booking.priceMinor, booking.currency)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<div className="flex items-center justify-between gap-2 text-muted-foreground text-sm">
				<span>
					{first}–{last} of {data.total}
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
		</div>
	);
}
