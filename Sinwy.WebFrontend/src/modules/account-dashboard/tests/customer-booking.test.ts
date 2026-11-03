import { describe, expect, it } from "bun:test";
import type { CustomerBookingDetailDto } from "@sinwy/shared";
import {
	cancelPolicyOf,
	isUpcoming,
	statusLineOf,
	windowPassedMessage,
} from "#/modules/account-dashboard/lib/customer-booking";

const NOW = new Date("2026-11-04T12:00:00Z");

const booking = (
	overrides: Partial<CustomerBookingDetailDto> = {},
): CustomerBookingDetailDto => ({
	id: "b1",
	serviceId: "s1",
	serviceName: "Haircut",
	startsAt: "2026-11-05T12:00:00.000Z",
	endsAt: "2026-11-05T12:30:00.000Z",
	priceMinor: 2500,
	currency: "EUR",
	status: "confirmed",
	cancelledBy: null,
	cancellationReason: null,
	customerNote: null,
	cancellationWindowMinutes: 2880,
	createdAt: "2026-11-01T08:00:00.000Z",
	organization: {
		name: "Salon",
		slug: "salon",
		timezone: "Europe/Vilnius",
		city: null,
		country: null,
		phone: "+370 600",
		email: "salon@example.com",
	},
	history: [],
	...overrides,
});

describe("cancelPolicyOf", () => {
	it("gives the deadline while the window is still ahead", () => {
		expect(
			cancelPolicyOf(booking({ cancellationWindowMinutes: 720 }), NOW),
		).toEqual({
			canCancel: true,
			deadline: new Date("2026-11-05T00:00:00.000Z"),
		});
	});

	it("refuses a confirmed booking inside its window and says so", () => {
		expect(cancelPolicyOf(booking(), NOW)).toEqual({
			canCancel: false,
			windowPassed: true,
		});
	});

	it("lets a pending request inside the window be withdrawn", () => {
		expect(cancelPolicyOf(booking({ status: "pending" }), NOW)).toEqual({
			canCancel: true,
			deadline: null,
		});
	});

	it("refuses after the start without the window message", () => {
		expect(
			cancelPolicyOf(booking({ startsAt: "2026-11-04T11:00:00Z" }), NOW),
		).toEqual({ canCancel: false, windowPassed: false });
	});
});

describe("windowPassedMessage", () => {
	it("lists the contacts the business has", () => {
		expect(windowPassedMessage(booking())).toBe(
			"Cancellations within 48 hours of the start aren't possible online. Contact Salon at +370 600 or salon@example.com.",
		);
		const none = booking();
		none.organization = { ...none.organization, phone: null, email: null };
		expect(windowPassedMessage(none)).toEndWith("Contact Salon.");
	});
});

describe("statusLineOf", () => {
	it("waits for the business on a request, and calls a past one unanswered", () => {
		expect(statusLineOf(booking({ status: "pending" }), NOW)).toBe(
			"Waiting for Salon to confirm",
		);
		expect(
			statusLineOf(
				booking({ status: "pending", startsAt: "2026-11-04T11:00:00Z" }),
				NOW,
			),
		).toBe("Salon didn't answer this request before its start.");
	});

	it("tells a decline from a cancellation", () => {
		const cancelled = (fromStatus: "pending" | "confirmed") =>
			booking({
				status: "cancelled",
				cancelledBy: "organization",
				history: [
					{
						id: "e1",
						type: "status_changed",
						fromStatus,
						toStatus: "cancelled",
						actor: "organization",
						moved: null,
						occurredAt: "2026-11-02T08:00:00Z",
					},
				],
			});
		expect(statusLineOf(cancelled("pending"), NOW)).toBe("Declined by Salon");
		expect(statusLineOf(cancelled("confirmed"), NOW)).toBe(
			"Cancelled by Salon",
		);
	});
});

describe("isUpcoming", () => {
	it("keeps an active booking until it ends", () => {
		const inProgress = booking({
			startsAt: "2026-11-04T11:50:00Z",
			endsAt: "2026-11-04T12:20:00Z",
		});
		expect(isUpcoming(inProgress, NOW)).toBe(true);
		expect(isUpcoming(booking({ status: "cancelled" }), NOW)).toBe(false);
	});
});
