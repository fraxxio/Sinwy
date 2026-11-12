import type { BookingDto } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CancelDialog } from "#/modules/org-dashboard/components/bookings/BookingActions";
import {
	type StatusAction,
	statusActions,
} from "#/modules/org-dashboard/lib/booking-actions";
import {
	changeBookingStatus,
	invalidateBookings,
} from "#/modules/org-dashboard/lib/booking-queries";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import { FlatCard } from "#/shared/components/FlatCard";
import { Button } from "#/shared/components/ui/button";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { toast } from "#/shared/components/ui/toast";
import { formatShortDateIn, formatTimeIn } from "#/shared/lib/date";
import { formatMinorUnits } from "#/shared/lib/money";

export function PendingRequests({
	organizationId,
	organizationSlug,
	requests,
	total,
	timezone,
	canWrite,
}: {
	organizationId: string;
	organizationSlug: string;
	requests: BookingDto[];
	total: number;
	timezone: string;
	canWrite: boolean;
}) {
	return (
		<FlatCard>
			<CardHeader>
				<CardTitle>Pending requests</CardTitle>
				<CardDescription>
					{total > requests.length
						? `The oldest ${requests.length} of ${total}`
						: "Oldest request first"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{requests.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No requests waiting for an answer.
					</p>
				) : (
					<ul className="divide-y">
						{requests.map((booking) => (
							<RequestRow
								key={booking.id}
								organizationId={organizationId}
								organizationSlug={organizationSlug}
								booking={booking}
								timezone={timezone}
								canWrite={canWrite}
							/>
						))}
					</ul>
				)}
				{total > requests.length && (
					<Link
						to="/dashboard/$organizationSlug/bookings"
						params={{ organizationSlug }}
						search={{ view: "list", status: ["pending"] }}
						className="mt-3 inline-block text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
					>
						See all {total} requests
					</Link>
				)}
			</CardContent>
		</FlatCard>
	);
}

function RequestRow({
	organizationId,
	organizationSlug,
	booking,
	timezone,
	canWrite,
}: {
	organizationId: string;
	organizationSlug: string;
	booking: BookingDto;
	timezone: string;
	canWrite: boolean;
}) {
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const [declining, setDeclining] = useState<StatusAction | null>(null);
	const actions = statusActions(booking);
	const approve = actions.find((action) => action.to === "confirmed");
	const decline = actions.find((action) => action.to === "cancelled");

	const change = useMutation({
		mutationFn: async ({
			action,
			reason,
		}: {
			action: StatusAction;
			reason?: string;
		}) =>
			unwrap(
				await changeBookingStatus(
					organizationId,
					booking.id,
					action.to,
					action.needsReason ? { reason: reason?.trim() || null } : undefined,
				),
			),
		onSuccess: (_, { action }) => {
			setDeclining(null);
			toast.add({
				type: "success",
				title:
					action.to === "confirmed" ? "Booking confirmed" : "Request declined",
				timeout: 4_000,
			});
		},
		onError: (error) => {
			if (error.message)
				toast.add({ type: "error", title: error.message, timeout: 6_000 });
		},
		onSettled: () => invalidateBookings(queryClient, organizationId),
	});

	return (
		<li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
			<Link
				to="/dashboard/$organizationSlug/bookings/$id"
				params={{ organizationSlug, id: booking.id }}
				className="min-w-0 flex-1 rounded-md hover:underline"
			>
				<span className="block truncate font-medium text-sm">
					{booking.customerName} · {booking.serviceName}
				</span>
				<span className="block text-muted-foreground text-xs">
					{formatShortDateIn(booking.startsAt, timezone)},{" "}
					{formatTimeIn(booking.startsAt, timezone)} ·{" "}
					{formatMinorUnits(booking.priceMinor, booking.currency)}
				</span>
			</Link>
			{canWrite && (
				<div className="flex gap-2">
					{approve && (
						<Button
							size="sm"
							disabled={change.isPending}
							onClick={() => change.mutate({ action: approve })}
						>
							Approve
						</Button>
					)}
					{decline && (
						<Button
							size="sm"
							variant="outline"
							disabled={change.isPending}
							onClick={() => setDeclining(decline)}
						>
							Decline
						</Button>
					)}
				</div>
			)}
			{declining && (
				<CancelDialog
					action={declining}
					booking={booking}
					pending={change.isPending}
					onConfirm={(reason) => change.mutate({ action: declining, reason })}
					onClose={() => setDeclining(null)}
				/>
			)}
		</li>
	);
}
