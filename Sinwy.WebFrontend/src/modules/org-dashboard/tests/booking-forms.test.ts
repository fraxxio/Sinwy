import { describe, expect, it } from "bun:test";
import {
	bookingTimeSchema,
	bookingTimeValue,
	contactFormSchema,
	type ManualBookingFormValues,
	manualBookingFormSchema,
} from "#/modules/org-dashboard/lib/booking-forms";

const VILNIUS = "Europe/Vilnius";

const values = (
	change: Partial<ManualBookingFormValues> = {},
): ManualBookingFormValues => ({
	serviceId: "svc",
	when: {
		custom: false,
		date: "2026-11-04",
		start: "2026-11-04T13:00:00.000Z",
		time: "",
	},
	customerName: "Walk-in Ana",
	customerEmail: "",
	customerPhone: "+370 600 00000",
	internalNote: "",
	...change,
});

const errorsOf = (input: ManualBookingFormValues) => {
	const result = manualBookingFormSchema(VILNIUS).safeParse(input);
	return result.success
		? {}
		: Object.fromEntries(
				result.error.issues.map((issue) => [issue.path[0], issue.message]),
			);
};

const custom = (date: string, time: string) => ({
	custom: true,
	date,
	start: "",
	time,
});

describe("manualBookingFormSchema", () => {
	it("turns the form into a manual booking, with empty fields as null", () => {
		expect(manualBookingFormSchema(VILNIUS).parse(values())).toEqual({
			serviceId: "svc",
			startsAt: "2026-11-04T13:00:00.000Z",
			customerName: "Walk-in Ana",
			customerEmail: null,
			customerPhone: "+370 600 00000",
			internalNote: null,
		});
	});

	it("needs a name and an email or a phone, and says both at once", () => {
		expect(errorsOf(values({ customerName: " ", customerPhone: "" }))).toEqual({
			customerName: "Name is required",
			customerEmail: "Add an email or a phone number",
		});
		expect(
			errorsOf(values({ customerPhone: "", customerEmail: "ana@example.com" })),
		).toEqual({});
	});

	it("needs a picked time, or a day and time when typed", () => {
		expect(errorsOf(values({ when: { ...values().when, start: "" } }))).toEqual(
			{ when: "Pick a time" },
		);
		expect(errorsOf(values({ when: custom("2026-11-04", "") }))).toEqual({
			when: "Enter a day and a time",
		});
		expect(errorsOf(values({ serviceId: "" }))).toEqual({
			serviceId: "Pick a service",
		});
	});
});

describe("bookingTimeSchema", () => {
	it("reads a typed time in the organization's zone, not the browser's", () => {
		const startOf = (timezone: string, date: string, time: string) =>
			bookingTimeSchema(timezone).parse(custom(date, time));
		expect(startOf(VILNIUS, "2026-11-04", "15:15")).toBe(
			"2026-11-04T13:15:00.000Z",
		);
		expect(startOf("America/New_York", "2026-11-04", "15:15")).toBe(
			"2026-11-04T20:15:00.000Z",
		);
		// any minute, and on both sides of a DST change
		expect(startOf(VILNIUS, "2026-03-29", "10:07")).toBe(
			"2026-03-29T07:07:00.000Z",
		);
		expect(startOf(VILNIUS, "2026-10-25", "10:00")).toBe(
			"2026-10-25T08:00:00.000Z",
		);
		// the hour the clocks skip moves forward past the jump
		expect(startOf(VILNIUS, "2026-03-29", "03:30")).toBe(
			"2026-03-29T01:30:00.000Z",
		);
	});

	it("prefills a start as its date and wall time in the organization's zone", () => {
		expect(
			bookingTimeValue("2026-11-01", {
				iso: "2026-11-04T22:30:00.000Z",
				timezone: VILNIUS,
				custom: true,
			}),
		).toEqual({ custom: true, date: "2026-11-05", start: "", time: "00:30" });
	});
});

describe("contactFormSchema", () => {
	it("needs an email or a phone and sends empty ones as null", () => {
		expect(
			contactFormSchema.safeParse({
				customerName: "Ana",
				customerEmail: "",
				customerPhone: "",
			}).success,
		).toBe(false);
		expect(
			contactFormSchema.parse({
				customerName: "Ana",
				customerEmail: "ana@example.com",
				customerPhone: "",
			}),
		).toEqual({
			customerName: "Ana",
			customerEmail: "ana@example.com",
			customerPhone: null,
		});
	});
});
