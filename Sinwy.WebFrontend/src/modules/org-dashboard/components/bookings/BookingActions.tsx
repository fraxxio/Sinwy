import { BOOKING_LIMITS, type BookingDto } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { RescheduleDialog } from "#/modules/org-dashboard/components/bookings/RescheduleDialog";
import {
	canReschedule,
	type StatusAction,
	statusActions,
} from "#/modules/org-dashboard/lib/booking-actions";
import {
	changeBookingStatus,
	invalidateBookings,
} from "#/modules/org-dashboard/lib/booking-queries";
import { useUnwrapWrite } from "#/modules/org-dashboard/lib/service-queries";
import { Button } from "#/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/shared/components/ui/dialog";
import { Label } from "#/shared/components/ui/label";
import { Textarea } from "#/shared/components/ui/textarea";
import { toast } from "#/shared/components/ui/toast";

const toastError = (error: Error) => {
	if (error.message)
		toast.add({ type: "error", title: error.message, timeout: 6_000 });
};

const PRIMARY = new Set(["Confirm", "Complete"]);

const DONE: Record<string, string> = {
	Confirm: "Booking confirmed",
	Decline: "Request declined",
	"Cancel request": "Request cancelled",
	"Cancel booking": "Booking cancelled",
	Complete: "Marked as completed",
	"Mark as completed": "Marked as completed",
	"No-show": "Marked as no-show",
	"Mark as no-show": "Marked as no-show",
};

/** The status changes and reschedule staff may make to this booking now; only rendered for writers. */
export function BookingActions({
	organizationId,
	booking,
	timezone,
}: {
	organizationId: string;
	booking: BookingDto;
	timezone: string;
}) {
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const [cancelling, setCancelling] = useState<StatusAction | null>(null);
	const [rescheduling, setRescheduling] = useState(false);
	const actions = statusActions(booking);

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
			setCancelling(null);
			toast.add({ type: "success", title: DONE[action.label], timeout: 4_000 });
		},
		onError: toastError,
		onSettled: () => invalidateBookings(queryClient, organizationId),
	});

	if (actions.length === 0 && !canReschedule(booking)) return null;

	return (
		<div className="flex flex-wrap gap-2">
			{actions.map((action) => (
				<Button
					key={action.to}
					variant={PRIMARY.has(action.label) ? "default" : "outline"}
					disabled={change.isPending}
					onClick={() =>
						action.needsReason
							? setCancelling(action)
							: change.mutate({ action })
					}
				>
					{action.label}
				</Button>
			))}
			{canReschedule(booking) && (
				<Button
					variant="outline"
					disabled={change.isPending}
					onClick={() => setRescheduling(true)}
				>
					Reschedule
				</Button>
			)}
			{cancelling && (
				<CancelDialog
					action={cancelling}
					booking={booking}
					pending={change.isPending}
					onConfirm={(reason) => change.mutate({ action: cancelling, reason })}
					onClose={() => setCancelling(null)}
				/>
			)}
			{rescheduling && (
				<RescheduleDialog
					organizationId={organizationId}
					booking={booking}
					timezone={timezone}
					onClose={() => setRescheduling(false)}
				/>
			)}
		</div>
	);
}

export function CancelDialog({
	action,
	booking,
	pending,
	onConfirm,
	onClose,
}: {
	action: StatusAction;
	booking: BookingDto;
	pending: boolean;
	onConfirm: (reason: string) => void;
	onClose: () => void;
}) {
	const [reason, setReason] = useState("");
	const reasonId = useId();

	return (
		<Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
			<DialogContent>
				<form
					className="grid gap-6"
					onSubmit={(e) => {
						e.preventDefault();
						onConfirm(reason);
					}}
				>
					<DialogHeader>
						<DialogTitle>
							{booking.status === "pending"
								? `${action.label === "Decline" ? "Decline" : "Cancel"} this request?`
								: "Cancel this booking?"}
						</DialogTitle>
						<DialogDescription>
							{booking.customerEmail
								? `${booking.customerName} gets an email with your reason.`
								: `There's no email for ${booking.customerName}, so let them know yourself.`}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor={reasonId}>Reason (optional)</Label>
						<Textarea
							id={reasonId}
							value={reason}
							maxLength={BOOKING_LIMITS.cancellationReason}
							rows={3}
							onChange={(event) => setReason(event.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={pending}
							onClick={onClose}
						>
							Keep it
						</Button>
						<Button type="submit" variant="destructive" disabled={pending}>
							{pending ? "Saving…" : action.label}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
