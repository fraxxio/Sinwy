import type { CustomerBookingDto } from "@sinwy/shared";

const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

/** RFC 5545 TEXT escaping. */
export const escapeText = (value: string) =>
	value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r\n|\r|\n/g, "\\n");

/** Splits a content line into lines of at most 75 octets, never inside a character. */
export const foldLine = (line: string) => {
	const lines: string[] = [];
	let current = "";
	let octets = 0;
	for (const char of line) {
		const size = encoder.encode(char).length;
		// a continuation line starts with a space, which counts toward its 75
		const limit = lines.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
		if (octets + size > limit) {
			lines.push(current);
			current = "";
			octets = 0;
		}
		current += char;
		octets += size;
	}
	lines.push(current);
	return lines.join("\r\n ");
};

/** "20261105T080000Z" */
export const icsUtc = (iso: string | Date) =>
	new Date(iso)
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");

/** A one-event calendar file for the booking, with CRLF line endings. */
export const bookingToIcs = (
	booking: CustomerBookingDto,
	detailUrl: string,
	now = new Date(),
) => {
	const { organization } = booking;
	const location = [organization.city, organization.country]
		.filter(Boolean)
		.join(", ");
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Sinwy//Bookings//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${booking.id}@sinwy`,
		`DTSTAMP:${icsUtc(now)}`,
		`DTSTART:${icsUtc(booking.startsAt)}`,
		`DTEND:${icsUtc(booking.endsAt)}`,
		`SUMMARY:${escapeText(`${booking.serviceName} at ${organization.name}`)}`,
		...(location ? [`LOCATION:${escapeText(location)}`] : []),
		`URL:${detailUrl}`,
		`STATUS:${booking.status === "pending" ? "TENTATIVE" : "CONFIRMED"}`,
		"END:VEVENT",
		"END:VCALENDAR",
	];
	return `${lines.map(foldLine).join("\r\n")}\r\n`;
};

/** Saves the booking as an `.ics` file through the browser. */
export const downloadBookingIcs = (booking: CustomerBookingDto) => {
	const detailUrl = new URL(
		`/account/bookings/${booking.id}`,
		window.location.origin,
	).toString();
	const blob = new Blob([bookingToIcs(booking, detailUrl)], {
		type: "text/calendar;charset=utf-8",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `booking-${booking.id}.ics`;
	link.click();
	URL.revokeObjectURL(url);
};
