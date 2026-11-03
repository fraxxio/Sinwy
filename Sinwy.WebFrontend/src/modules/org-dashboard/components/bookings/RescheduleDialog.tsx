import type { BookingDto } from "@sinwy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookingTimeField } from "#/modules/org-dashboard/components/bookings/BookingTimeField";
import {
	type BookingTimeValue,
	bookingTimeSchema,
} from "#/modules/org-dashboard/lib/booking-forms";
import {
	invalidateBookings,
	rescheduleBooking,
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
import { toast } from "#/shared/components/ui/toast";
import {
	formatDateIn,
	formatTimeIn,
	localDateOf,
	todayIn,
} from "#/shared/lib/date";

/** Moves a booking to a free time of its service, or any typed time; it keeps its length, status and price. */
export function RescheduleDialog({
	organizationId,
	booking,
	timezone,
	onClose,
}: {
	organizationId: string;
	booking: BookingDto;
	timezone: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const today = todayIn(timezone);
	const bookedDate = localDateOf(booking.startsAt, timezone);
	const [value, setValue] = useState<BookingTimeValue>({
		custom: false,
		date: bookedDate < today ? today : bookedDate,
		start: "",
		time: formatTimeIn(booking.startsAt, timezone),
	});
	const [error, setError] = useState<string | null>(null);

	const move = useMutation({
		mutationFn: async (startsAt: string) =>
			unwrap(await rescheduleBooking(organizationId, booking.id, { startsAt })),
		onSuccess: (moved) => {
			toast.add({
				type: "success",
				title: `Moved to ${formatDateIn(moved.startsAt, timezone)}, ${formatTimeIn(moved.startsAt, timezone)}`,
				timeout: 4_000,
			});
			onClose();
		},
		onError: (failure) => setError(failure.message || null),
		onSettled: () => invalidateBookings(queryClient, organizationId),
	});

	const submit = () => {
		const startsAt = bookingTimeSchema(timezone).safeParse(value);
		if (!startsAt.success) {
			setError(startsAt.error.issues[0]?.message ?? "Pick a time");
			return;
		}
		setError(null);
		move.mutate(startsAt.data);
	};

	return (
		<Dialog open onOpenChange={(open) => !open && !move.isPending && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<form
					className="grid gap-6"
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					<DialogHeader>
						<DialogTitle>Reschedule</DialogTitle>
						<DialogDescription>
							{booking.serviceName}, now{" "}
							{formatDateIn(booking.startsAt, timezone)} at{" "}
							{formatTimeIn(booking.startsAt, timezone)}.
							{booking.customerEmail &&
								` ${booking.customerName} gets an email with the new time.`}
						</DialogDescription>
					</DialogHeader>
					<BookingTimeField
						organizationId={organizationId}
						timezone={timezone}
						serviceId={booking.serviceId}
						excludeBookingId={booking.id}
						value={value}
						onChange={(next) => {
							setValue(next);
							setError(null);
						}}
						error={error ?? undefined}
					/>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={move.isPending}
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={move.isPending}>
							{move.isPending ? "Moving…" : "Move booking"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
