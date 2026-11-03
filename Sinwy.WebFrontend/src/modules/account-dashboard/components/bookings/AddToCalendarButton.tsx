import type { CustomerBookingDto } from "@sinwy/shared";
import { CalendarPlusIcon } from "lucide-react";
import { downloadBookingIcs } from "#/modules/account-dashboard/lib/ics";
import { Button } from "#/shared/components/ui/button";

export function AddToCalendarButton({
	booking,
}: {
	booking: CustomerBookingDto;
}) {
	return (
		<Button variant="outline" onClick={() => downloadBookingIcs(booking)}>
			<CalendarPlusIcon />
			Add to calendar
		</Button>
	);
}
