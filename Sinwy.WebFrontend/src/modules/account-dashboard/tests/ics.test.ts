import { describe, expect, it } from "bun:test";
import type { CustomerBookingDto } from "@sinwy/shared";
import {
	bookingToIcs,
	escapeText,
	foldLine,
	icsUtc,
} from "#/modules/account-dashboard/lib/ics";

const booking = (
	overrides: Partial<CustomerBookingDto> = {},
): CustomerBookingDto => ({
	id: "b1",
	serviceId: "s1",
	serviceName: "Haircut",
	startsAt: "2026-11-05T08:00:00.000Z",
	endsAt: "2026-11-05T08:30:00.000Z",
	priceMinor: 2500,
	currency: "EUR",
	status: "confirmed",
	cancelledBy: null,
	cancellationReason: null,
	customerNote: null,
	cancellationWindowMinutes: 0,
	createdAt: "2026-11-01T08:00:00.000Z",
	organization: {
		name: "Salon",
		slug: "salon",
		timezone: "Europe/Vilnius",
		city: "Vilnius",
		country: "Lithuania",
		phone: null,
		email: null,
	},
	...overrides,
});

const URL_ = "https://sinwy.test/account/bookings/b1";
const NOW = new Date("2026-11-03T12:00:00Z");

const linesOf = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("escapeText", () => {
	it("escapes backslashes, semicolons, commas and newlines", () => {
		expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
	});
});

describe("foldLine", () => {
	it("leaves a line of 75 octets alone", () => {
		const line = "x".repeat(75);
		expect(foldLine(line)).toBe(line);
	});

	it("folds longer lines at 75 octets, continuations starting with a space", () => {
		const folded = foldLine("x".repeat(200));
		const parts = folded.split("\r\n");
		expect(parts.map((part) => part.length)).toEqual([75, 75, 52]);
		expect(parts.slice(1).every((part) => part.startsWith(" "))).toBe(true);
		expect(folded.replace(/\r\n /g, "")).toBe("x".repeat(200));
	});

	it("never splits a multi-byte character", () => {
		const folded = foldLine(`SUMMARY:${"ž".repeat(60)}`);
		const encoder = new TextEncoder();
		for (const part of folded.split("\r\n"))
			expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
		expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"ž".repeat(60)}`);
	});
});

describe("bookingToIcs", () => {
	it("writes one event with CRLF endings and the booking's fields", () => {
		const ics = bookingToIcs(booking(), URL_, NOW);
		expect(ics.endsWith("\r\n")).toBe(true);
		expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
		expect(linesOf(ics)).toEqual([
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//Sinwy//Bookings//EN",
			"CALSCALE:GREGORIAN",
			"METHOD:PUBLISH",
			"BEGIN:VEVENT",
			"UID:b1@sinwy",
			"DTSTAMP:20261103T120000Z",
			"DTSTART:20261105T080000Z",
			"DTEND:20261105T083000Z",
			"SUMMARY:Haircut at Salon",
			"LOCATION:Vilnius\\, Lithuania",
			`URL:${URL_}`,
			"STATUS:CONFIRMED",
			"END:VEVENT",
			"END:VCALENDAR",
			"",
		]);
	});

	it("marks a request tentative and escapes the summary", () => {
		const lines = linesOf(
			bookingToIcs(
				booking({
					status: "pending",
					serviceName: "Cut; wash, dry",
				}),
				URL_,
				NOW,
			),
		);
		expect(lines).toContain("STATUS:TENTATIVE");
		expect(lines).toContain("SUMMARY:Cut\\; wash\\, dry at Salon");
	});

	it("leaves out the location when the business has none", () => {
		const ics = bookingToIcs(
			booking({
				organization: { ...booking().organization, city: null, country: null },
			}),
			URL_,
			NOW,
		);
		expect(ics).not.toContain("LOCATION");
	});

	it("writes UTC times on a DST-change day", () => {
		// Vilnius leaves summer time at 04:00 local on 25 Oct 2026
		const before = icsUtc("2026-10-25T02:30:00+03:00");
		const after = icsUtc("2026-10-25T10:00:00+02:00");
		expect(before).toBe("20261024T233000Z");
		expect(after).toBe("20261025T080000Z");
		const lines = linesOf(
			bookingToIcs(
				booking({
					startsAt: "2026-10-25T10:00:00+02:00",
					endsAt: "2026-10-25T11:30:00+02:00",
				}),
				URL_,
				NOW,
			),
		);
		expect(lines).toContain("DTSTART:20261025T080000Z");
		expect(lines).toContain("DTEND:20261025T093000Z");
	});
});
