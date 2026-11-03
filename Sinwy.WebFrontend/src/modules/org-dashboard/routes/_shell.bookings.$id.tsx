import {
	BOOKING_LIMITS,
	type BookingDetailDto,
	hasPermission,
} from "@sinwy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { BookingActions } from "#/modules/org-dashboard/components/bookings/BookingActions";
import { BookingHistory } from "#/modules/org-dashboard/components/bookings/BookingHistory";
import { ContactCard } from "#/modules/org-dashboard/components/bookings/ContactCard";
import {
	bookingQuery,
	invalidateBookings,
	updateBooking,
} from "#/modules/org-dashboard/lib/booking-queries";
import {
	availabilityQuery,
	useUnwrapWrite,
} from "#/modules/org-dashboard/lib/service-queries";
import { formatDuration } from "#/modules/org-dashboard/lib/services";
import {
	BookingStatusBadge,
	isExpiredRequest,
} from "#/shared/components/booking/BookingStatusBadge";
import { PageHeader } from "#/shared/components/PageHeader";
import { Button } from "#/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/shared/components/ui/card";
import { FieldError } from "#/shared/components/ui/field";
import { Label } from "#/shared/components/ui/label";
import { Skeleton } from "#/shared/components/ui/skeleton";
import { Textarea } from "#/shared/components/ui/textarea";
import { toast } from "#/shared/components/ui/toast";
import { formatDateIn, formatTimeIn } from "#/shared/lib/date";
import { formatMinorUnits } from "#/shared/lib/money";

export const Route = createFileRoute(
	"/dashboard/$organizationSlug/_shell/bookings/$id",
)({
	staticData: { crumb: "Booking" },
	component: BookingDetailPage,
});

function BookingDetailPage() {
	const { id } = Route.useParams();
	const { organization, member } = Route.useRouteContext();
	const canWrite = hasPermission(member.roles, "bookings:write");
	const booking = useQuery(bookingQuery(organization.id, id));
	const availability = useQuery(availabilityQuery(organization.id));

	if (booking.isError || availability.isError)
		return (
			<>
				<PageHeader title="Booking" />
				<FieldError>
					{(booking.error ?? availability.error)?.message}
				</FieldError>
			</>
		);
	if (booking.isPending || availability.isPending)
		return <Skeleton className="h-96 rounded-xl" />;

	const { timezone } = availability.data;
	const data = booking.data;

	return (
		<>
			<PageHeader title={data.customerName} />
			<Card>
				<CardContent className="flex flex-wrap items-start justify-between gap-4">
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-3">
							<BookingStatusBadge booking={data} />
							<p className="font-medium">
								{data.serviceName} · {formatDateIn(data.startsAt, timezone)},{" "}
								{formatTimeIn(data.startsAt, timezone)}–
								{formatTimeIn(data.endsAt, timezone)}
							</p>
						</div>
						<StatusNote booking={data} />
					</div>
					{canWrite && (
						<BookingActions
							organizationId={organization.id}
							booking={data}
							timezone={timezone}
						/>
					)}
				</CardContent>
			</Card>
			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Appointment</CardTitle>
						<CardDescription>Times in {timezone}</CardDescription>
					</CardHeader>
					<CardContent>
						<dl className="grid gap-2 text-sm sm:grid-cols-[5rem_1fr]">
							<dt className="text-muted-foreground">Service</dt>
							<dd>{data.serviceName}</dd>
							<dt className="text-muted-foreground">When</dt>
							<dd>
								{formatDateIn(data.startsAt, timezone)},{" "}
								{formatTimeIn(data.startsAt, timezone)}–
								{formatTimeIn(data.endsAt, timezone)}
							</dd>
							<dt className="text-muted-foreground">Length</dt>
							<dd>
								{formatDuration(
									(Date.parse(data.endsAt) - Date.parse(data.startsAt)) /
										60_000,
								)}
							</dd>
							<dt className="text-muted-foreground">Price</dt>
							<dd>{formatMinorUnits(data.priceMinor, data.currency)}</dd>
							<dt className="text-muted-foreground">Booked</dt>
							<dd>
								{formatDateIn(data.createdAt, timezone)},{" "}
								{formatTimeIn(data.createdAt, timezone)}
							</dd>
						</dl>
					</CardContent>
				</Card>
				<ContactCard
					organizationId={organization.id}
					booking={data}
					canWrite={canWrite}
				/>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Notes</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-6">
					{data.bookedBy === "customer" && (
						<div className="space-y-1">
							<p className="font-medium text-sm">From the customer</p>
							<p className="whitespace-pre-wrap text-muted-foreground text-sm">
								{data.customerNote ?? "No note."}
							</p>
						</div>
					)}
					<InternalNote
						key={data.internalNote ?? ""}
						organizationId={organization.id}
						booking={data}
						canWrite={canWrite}
					/>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>History</CardTitle>
				</CardHeader>
				<CardContent>
					<BookingHistory booking={data} timezone={timezone} />
				</CardContent>
			</Card>
		</>
	);
}

function StatusNote({ booking }: { booking: BookingDetailDto }) {
	if (isExpiredRequest(booking))
		return (
			<p className="text-muted-foreground text-sm">
				Nobody answered this request before its start, so it can only be
				cancelled.
			</p>
		);
	if (booking.status !== "cancelled") return null;
	const who =
		booking.cancelledBy === "customer"
			? "Cancelled by the customer"
			: "Cancelled by your team";
	return (
		<p className="text-muted-foreground text-sm">
			{who}
			{booking.cancellationReason && `: ${booking.cancellationReason}`}
		</p>
	);
}

function InternalNote({
	organizationId,
	booking,
	canWrite,
}: {
	organizationId: string;
	booking: BookingDetailDto;
	canWrite: boolean;
}) {
	const noteId = useId();
	const queryClient = useQueryClient();
	const unwrap = useUnwrapWrite();
	const saved = booking.internalNote ?? "";
	const [note, setNote] = useState(saved);

	const save = useMutation({
		mutationFn: async () =>
			unwrap(
				await updateBooking(organizationId, booking.id, { internalNote: note }),
			),
		onSuccess: () =>
			toast.add({ type: "success", title: "Note saved", timeout: 4_000 }),
		onSettled: () => invalidateBookings(queryClient, organizationId),
	});

	return (
		<form
			className="space-y-2"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate();
			}}
		>
			<Label htmlFor={noteId}>Internal note</Label>
			<Textarea
				id={noteId}
				value={note}
				rows={3}
				maxLength={BOOKING_LIMITS.note}
				disabled={!canWrite}
				placeholder="Only your team sees it."
				onChange={(event) => setNote(event.target.value)}
			/>
			{save.error?.message && <FieldError>{save.error.message}</FieldError>}
			{canWrite && (
				<Button
					type="submit"
					size="sm"
					variant="outline"
					disabled={save.isPending || note === saved}
				>
					{save.isPending ? "Saving…" : "Save note"}
				</Button>
			)}
		</form>
	);
}
