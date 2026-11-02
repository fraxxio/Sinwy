import type { CustomerBookingDto } from "@sinwy/shared";
import { Link } from "@tanstack/react-router";
import { CalendarCheckIcon, HourglassIcon } from "lucide-react";
import { ContentBox } from "#/shared/components/ContentBox";
import { Button } from "#/shared/components/ui/button";
import { formatDateIn, formatTimeIn } from "#/shared/lib/date";

export function BookingSuccess({
	booking,
	onBookAnother,
}: {
	booking: CustomerBookingDto;
	onBookAnother: () => void;
}) {
	const { organization } = booking;
	const pending = booking.status === "pending";

	return (
		<ContentBox className="items-center gap-4 text-center">
			<div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">
				{pending ? <HourglassIcon /> : <CalendarCheckIcon />}
			</div>
			<div className="space-y-1">
				<h2 className="font-semibold text-xl">
					{pending
						? `Request sent — ${organization.name} will confirm`
						: "Booked"}
				</h2>
				<p className="text-muted-foreground text-sm">
					{booking.serviceName},{" "}
					{formatDateIn(booking.startsAt, organization.timezone)} at{" "}
					{formatTimeIn(booking.startsAt, organization.timezone)} (
					{organization.timezone})
				</p>
				<p className="text-muted-foreground text-sm">
					{pending
						? "We've emailed you the request, and will email again when they confirm."
						: "We've emailed you the confirmation."}
				</p>
			</div>
			<div className="flex flex-wrap justify-center gap-2">
				<Button
					nativeButton={false}
					render={
						<Link to="/account/bookings/$id" params={{ id: booking.id }} />
					}
				>
					View booking
				</Button>
				<Button variant="outline" onClick={onBookAnother}>
					Book another
				</Button>
			</div>
		</ContentBox>
	);
}
